import assert from "node:assert/strict";
import test from "node:test";
import {
  activatePolyGui,
  activatePolyTouched,
  activatePolyTool,
  analyzePolyScript,
  executePolyCommand,
  type PolyProject,
  runPolyProject,
} from "./polyProject";
import { parseServerMessage } from "./multiplayer";

function project(): PolyProject {
  return {
    version: 2,
    id: "11111111-1111-4111-8111-111111111111",
    name: "Runtime Test",
    description: "",
    language: "luau",
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:00:00.000Z",
    objects: [
      {
        id: "part",
        name: "Part",
        type: "part",
        position: [0, 2, 0],
        rotation: [0, 0, 0],
        scale: [4, 4, 4],
        color: "#342856",
        anchored: true,
        visible: true,
        transparency: 0,
        material: "plastic",
        surfaceTexture: "none",
        canCollide: true,
        castShadow: true,
        modelId: null,
        attributes: {},
        tags: [],
      },
    ],
    models: [],
    remotes: [],
    scripts: [
      {
        id: "server",
        name: "Main",
        kind: "script",
        parent: "ServerScriptService",
        source: `local part = Workspace:FindFirstChild("Part")
part.Color = "#FF3366"
part.Position = Vector3.new(2, 5, 1)
print("server ready")`,
      },
      {
        id: "client",
        name: "Client",
        kind: "localScript",
        parent: "StarterPlayerScripts",
        source: `local player = Players.LocalPlayer
local label = PlayerGui:FindFirstChild("Status")
player.WalkSpeed = 24
label.Text = "Ready"`,
      },
    ],
    gui: [
      {
        id: "screen",
        name: "Hud",
        type: "screenGui",
        parentId: null,
        position: [0, 0],
        size: [1, 1],
        backgroundColor: "#000000",
        backgroundTransparency: 1,
        text: "",
        textColor: "#FFFFFF",
        visible: true,
        rotation: 0,
        textSize: 16,
        borderRadius: 7,
        zIndex: 1,
      },
      {
        id: "status",
        name: "Status",
        type: "textLabel",
        parentId: "screen",
        position: [0.05, 0.05],
        size: [0.2, 0.1],
        backgroundColor: "#17131F",
        backgroundTransparency: 0,
        text: "Loading",
        textColor: "#FFFFFF",
        visible: true,
        rotation: 0,
        textSize: 16,
        borderRadius: 7,
        zIndex: 1,
      },
    ],
    playerSettings: {
      health: 100,
      walkSpeed: 18,
      jumpPower: 10.5,
      cameraFieldOfView: 55,
      maxHealth: 100,
    },
    leaderstats: [],
    animations: [],
    publication: null,
    dataStores: {},
  };
}

test("applies server and local property scripts in order", () => {
  const result = runPolyProject(project());
  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.project.objects[0].color, "#FF3366");
  assert.deepEqual(result.project.objects[0].position, [2, 5, 1]);
  assert.equal(result.project.playerSettings.walkSpeed, 24);
  assert.equal(result.project.gui[1].text, "Ready");
  assert.deepEqual(result.output, [
    { level: "info", message: "server ready", scriptName: "Main" },
  ]);
});

test("reports unknown objects and invalid property values", () => {
  const fixture = project();
  const script = {
    ...fixture.scripts[0],
    source: `local missing = Workspace:FindFirstChild("Missing")
local part = Workspace:FindFirstChild("Part")
part.Color = "purple"`,
  };
  const diagnostics = analyzePolyScript(script, fixture);
  assert.equal(diagnostics.length, 2);
  assert.match(diagnostics[0].message, /No object named "Missing"/);
  assert.match(diagnostics[1].message, /hex string/);
});

test("prevents server scripts from using LocalPlayer", () => {
  const fixture = project();
  const script = {
    ...fixture.scripts[0],
    source: `local player = Players.LocalPlayer
player.WalkSpeed = 50`,
  };
  const diagnostics = analyzePolyScript(script, fixture);
  assert.ok(
    diagnostics.some((diagnostic) =>
      diagnostic.message.includes("Server scripts cannot"),
    ),
  );
});

test("detects missing Luau block endings and malformed assignments", () => {
  const fixture = project();
  const script = {
    ...fixture.scripts[0],
    source: `if true then
local value =`,
  };
  const diagnostics = analyzePolyScript(script, fixture);
  assert.ok(
    diagnostics.some((diagnostic) => diagnostic.message.includes("after '='")),
  );
  assert.ok(
    diagnostics.some((diagnostic) => diagnostic.message.includes("missing 'end'")),
  );
});

test("loads ModuleScript exports into property assignments", () => {
  const fixture = project();
  fixture.scripts.unshift({
    id: "module",
    name: "CharacterConfig",
    kind: "moduleScript",
    parent: "ReplicatedStorage",
    source: `return {
    WalkSpeed = 28,
}`,
  });
  fixture.scripts[2].source = `local config = require("CharacterConfig")
local player = Players.LocalPlayer
player.WalkSpeed = config.WalkSpeed`;

  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.project.playerSettings.walkSpeed, 28);
});

test("persists server data and can read it into object properties", () => {
  const fixture = project();
  fixture.scripts[0].source = `local store = DataStoreService:GetDataStore("World")
store:SetAsync("PartTransparency", 0.4)
local saved = store.GetAsync("PartTransparency")
local part = Workspace:FindFirstChild("Part")
part.Transparency = saved`;

  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.project.dataStores.World.PartTransparency, 0.4);
  assert.equal(result.project.objects[0].transparency, 0.4);
});

test("supports C++ property assignments", () => {
  const fixture = project();
  fixture.language = "cpp";
  fixture.scripts = [
    {
      id: "cpp-server",
      name: "Main",
      kind: "script",
      parent: "Workspace",
      source: `auto part = Workspace.Find("Part");
part.Material = "metal";
part.CanCollide = false;`,
    },
  ];

  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.project.objects[0].material, "metal");
  assert.equal(result.project.objects[0].canCollide, false);
});

test("supports C# property assignments", () => {
  const fixture = project();
  fixture.language = "csharp";
  fixture.scripts = [
    {
      id: "csharp-server",
      name: "Main",
      kind: "script",
      parent: "ServerScriptService",
      source: `var part = Workspace.Find("Part");
part.Position = new Vector3(1, 4, 2);
part.CastShadow = false;`,
    },
  ];

  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0);
  assert.deepEqual(result.project.objects[0].position, [1, 4, 2]);
  assert.equal(result.project.objects[0].castShadow, false);
});

test("runs RemoteEvents with client and server call rules", () => {
  const fixture = project();
  fixture.remotes = [
    {
      id: "damage-event",
      name: "DamageEvent",
      kind: "remoteEvent",
    },
  ];
  fixture.scripts = [
    {
      id: "remote-server",
      name: "RemoteServer",
      kind: "script",
      parent: "ServerScriptService",
      source: `local event = ReplicatedStorage:FindFirstChild("DamageEvent")
event:FireAllClients("ready")`,
    },
    {
      id: "remote-client",
      name: "RemoteClient",
      kind: "localScript",
      parent: "StarterPlayerScripts",
      source: `local event = ReplicatedStorage:FindFirstChild("DamageEvent")
event:FireServer(25)`,
    },
  ];

  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0);
  assert.deepEqual(
    result.output.map((entry) => entry.message),
    [
      'DamageEvent.FireAllClients("ready")',
      "DamageEvent.FireServer(25)",
    ],
  );
});

test("supports Attributes and Tags as gameplay metadata", () => {
  const fixture = project();
  fixture.scripts = [
    {
      id: "metadata",
      name: "Metadata",
      kind: "script",
      parent: "Workspace",
      source: `local part = Workspace:FindFirstChild("Part")
part:SetAttribute("Damage", 30)
CollectionService:AddTag(part, "Hazard")
local damage = part:GetAttribute("Damage")
part.Transparency = damage`,
    },
  ];

  const result = runPolyProject(fixture);
  assert.ok(
    result.diagnostics.some((diagnostic) =>
      diagnostic.message.includes("between 0 and 1"),
    ),
  );
  fixture.scripts[0].source = `local part = Workspace:FindFirstChild("Part")
part:SetAttribute("Transparency", 0.3)
CollectionService:AddTag(part, "Hazard")
local saved = part:GetAttribute("Transparency")
part.Transparency = saved`;
  const valid = runPolyProject(fixture);
  assert.equal(valid.diagnostics.length, 0);
  assert.equal(valid.project.objects[0].attributes.Transparency, 0.3);
  assert.deepEqual(valid.project.objects[0].tags, ["Hazard"]);
  assert.equal(valid.project.objects[0].transparency, 0.3);
});

test("supports RemoteFunctions in C# client scripts", () => {
  const fixture = project();
  fixture.language = "csharp";
  fixture.remotes = [
    {
      id: "inventory-function",
      name: "GetInventory",
      kind: "remoteFunction",
    },
  ];
  fixture.scripts = [
    {
      id: "remote-function-client",
      name: "InventoryClient",
      kind: "localScript",
      parent: "StarterPlayerScripts",
      source: `var remote = ReplicatedStorage.Find("GetInventory");
var inventory = remote.InvokeServer("lava");`,
    },
  ];

  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(
    result.output[0].message,
    'GetInventory.InvokeServer("lava")',
  );
});

test("runs TextButton LocalScripts only when the button is activated", () => {
  const fixture = project();
  fixture.gui.push({
    id: "play-button",
    name: "PlayButton",
    type: "textButton",
    parentId: "screen",
    position: [0.4, 0.4],
    size: [0.2, 0.1],
    backgroundColor: "#6F49BB",
    backgroundTransparency: 0,
    text: "Play",
    textColor: "#FFFFFF",
    visible: true,
    rotation: 0,
    textSize: 16,
    borderRadius: 7,
    zIndex: 2,
  });
  fixture.scripts = [
    {
      id: "button-script",
      name: "ButtonClient",
      kind: "localScript",
      parent: "play-button",
      source: `local button = script.Parent
button.Activated:Connect(function()
    button.Text = "Clicked"
    print("activated")
end)`,
    },
  ];

  const started = runPolyProject(fixture);
  assert.equal(started.diagnostics.length, 0);
  assert.equal(started.project.gui[2].text, "Play");
  assert.equal(started.output.length, 0);

  const activated = activatePolyGui(started.project, "play-button");
  assert.equal(activated.diagnostics.length, 0);
  assert.equal(activated.project.gui[2].text, "Clicked");
  assert.deepEqual(activated.output, [
    { level: "info", message: "activated", scriptName: "ButtonClient" },
  ]);

  activated.project.scripts[0].source = activated.project.scripts[0].source.replace(
    "Activated",
    "MouseButton1Click",
  );
  activated.project.gui[2].text = "Play";
  const clicked = activatePolyGui(activated.project, "play-button");
  assert.equal(clicked.diagnostics.length, 0);
  assert.equal(clicked.project.gui[2].text, "Clicked");
});

test("runs Part Touched scripts only when the avatar enters the part", () => {
  const fixture = project();
  fixture.scripts = [
    {
      id: "touch-script",
      name: "TouchScript",
      kind: "script",
      parent: "part",
      source: `local block = script.Parent

block.Touched:Connect(function(hit)
    block.Color = "#22CC88"
    print("Avatar touched the block")
end)`,
    },
  ];

  const started = runPolyProject(fixture);
  assert.equal(started.diagnostics.length, 0);
  assert.equal(started.project.objects[0].color, "#342856");
  assert.deepEqual(started.output, []);

  const touched = activatePolyTouched(started.project, "part");
  assert.equal(touched.project.objects[0].color, "#22CC88");
  assert.deepEqual(touched.output, [
    {
      level: "info",
      message: "Avatar touched the block",
      scriptName: "TouchScript",
    },
  ]);
});

test("supports Touched handlers in all Studio scripting languages", () => {
  const sources = {
    luau: `local block = script.Parent
block.Touched:Connect(function(hit)
    block.Transparency = 0.5
end)`,
    cpp: `#include <poly/server.hpp>
auto block = Script.Parent;
block.Touched.Connect([&](auto hit) {
    block.Transparency = 0.5;
});`,
    csharp: `using Poly;
var block = Script.Parent;
block.Touched += (hit) => {
    block.Transparency = 0.5;
};`,
  } as const;

  for (const [language, source] of Object.entries(sources)) {
    const fixture = project();
    fixture.language = language as PolyProject["language"];
    fixture.scripts = [
      {
        id: `touch-${language}`,
        name: "TouchScript",
        kind: "script",
        parent: "part",
        source,
      },
    ];
    const touched = activatePolyTouched(fixture, "part");
    assert.equal(touched.diagnostics.length, 0, language);
    assert.equal(touched.project.objects[0].transparency, 0.5, language);
  }
});

test("supports TextButton activation callbacks in C++ and C#", () => {
  for (const language of ["cpp", "csharp"] as const) {
    const fixture = project();
    fixture.language = language;
    fixture.gui.push({
      id: "language-button",
      name: "LanguageButton",
      type: "textButton",
      parentId: "screen",
      position: [0.4, 0.4],
      size: [0.2, 0.1],
      backgroundColor: "#6F49BB",
      backgroundTransparency: 0,
      text: "Run",
      textColor: "#FFFFFF",
      visible: true,
      rotation: 0,
      textSize: 16,
      borderRadius: 7,
      zIndex: 2,
    });
    fixture.scripts = [
      {
        id: `${language}-button-script`,
        name: "ButtonClient",
        kind: "localScript",
        parent: "language-button",
        source:
          language === "cpp"
            ? `auto button = Script.Parent;
button.Activated.Connect([&]() {
    button.Text = "C++ clicked";
});`
            : `var button = Script.Parent;
button.Activated += () => {
    button.Text = "C# clicked";
};`,
      },
    ];

    const started = runPolyProject(fixture);
    assert.equal(started.diagnostics.length, 0);
    assert.equal(started.project.gui[2].text, "Run");
    const activated = activatePolyGui(started.project, "language-button");
    assert.equal(activated.diagnostics.length, 0);
    assert.equal(
      activated.project.gui[2].text,
      language === "cpp" ? "C++ clicked" : "C# clicked",
    );
  }
});

test("supports scripts inside Workspace objects and enforces Tool module rules", () => {
  const fixture = project();
  fixture.objects.push(
    {
      ...structuredClone(fixture.objects[0]),
      id: "sword",
      name: "Sword",
      type: "tool",
      parentId: null,
    },
    {
      ...structuredClone(fixture.objects[0]),
      id: "sword-handle",
      name: "Handle",
      type: "handle",
      parentId: "sword",
    },
  );
  fixture.scripts = [
    {
      id: "tool-server",
      name: "ToolServer",
      kind: "script",
      parent: "sword",
      source: `local tool = script.Parent
tool.Friction = 0.4
tool.Restitution = 0.2
tool.Mass = 2`,
    },
    {
      id: "tool-client",
      name: "ToolClient",
      kind: "localScript",
      parent: "sword-handle",
      source: `local player = Players.LocalPlayer
player.WalkSpeed = 20`,
    },
  ];

  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.project.objects[1].friction, 0.4);
  assert.equal(result.project.objects[1].restitution, 0.2);
  assert.equal(result.project.objects[1].mass, 2);
  assert.equal(result.project.playerSettings.walkSpeed, 20);

  const invalidModule = {
    id: "tool-module",
    name: "ToolModule",
    kind: "moduleScript" as const,
    parent: "sword",
    source: "return {}",
  };
  assert.ok(
    analyzePolyScript(invalidModule, fixture).some((diagnostic) =>
      diagnostic.message.includes("ModuleScripts must"),
    ),
  );
  const nestedModule = {
    ...invalidModule,
    parent: "tool-server",
  };
  assert.equal(analyzePolyScript(nestedModule, fixture).length, 0);
});

test("applies surface textures and preserves editable leaderstats", () => {
  const fixture = project();
  fixture.leaderstats = [
    {
      id: "coins",
      name: "Coins",
      type: "number",
      defaultValue: 25,
    },
  ];
  fixture.scripts[0].source = `local part = Workspace:FindFirstChild("Part")
part.Texture = "Brick"`;
  fixture.scripts[1].source = `local player = Players.LocalPlayer
player.Coins = 40`;

  const result = runPolyProject(fixture);
  assert.equal(result.project.objects[0].surfaceTexture, "brick");
  assert.equal(result.project.leaderstats[0].defaultValue, 40);
});

test("requires an immutable game room id in multiplayer welcomes", () => {
  const player = {
    id: "connection-1",
    userId: "player-1",
    username: "lava",
    displayName: "Lava",
  };
  const valid = parseServerMessage(
    JSON.stringify({
      type: "welcome",
      gameId: "11111111-1111-4111-8111-111111111111",
      player,
      players: [],
      chatMessages: [],
    }),
  );
  const missingRoom = parseServerMessage(
    JSON.stringify({
      type: "welcome",
      player,
      players: [],
      chatMessages: [],
    }),
  );

  assert.equal(valid?.type, "welcome");
  assert.equal(missingRoom, null);
});

test("normalizes animations and collects script playback requests", () => {
  const fixture = project();
  fixture.animations = [
    {
      id: "wave-animation",
      name: "Wave",
      rigModelId: null,
      duration: 0.5,
      looped: false,
      keyframes: [
        {
          time: 0,
          poses: {
            part: { rotation: [0, 0, 0] },
          },
        },
      ],
    },
  ];
  fixture.scripts[0].source = 'Animations:Play("Wave")';

  const result = runPolyProject(fixture);

  assert.deepEqual(result.animationRequests, ["Wave"]);
  assert.equal(result.project.animations[0].duration, 0.5);
});

test("activates sword tools, restarts animations, and damages nearby humanoids", () => {
  const fixture = project();
  const toolId = "sword-tool";
  const rootId = "dummy-root";
  fixture.objects.push(
    {
      ...fixture.objects[0],
      id: toolId,
      name: "LinkedSword",
      type: "tool",
      position: [0, 3, 0],
      scale: [1, 1, 1],
      modelId: null,
      parentId: null,
      attributes: { Damage: 20 },
      tags: ["DamageTool"],
    },
    {
      ...fixture.objects[0],
      id: rootId,
      name: "HumanoidRootPart",
      type: "humanoidRootPart",
      position: [2, 3, 0],
      scale: [2, 2, 1],
      modelId: "dummy-model",
      parentId: null,
      attributes: { Health: 100, MaxHealth: 100 },
      tags: ["Humanoid"],
    },
  );
  fixture.models.push({
    id: "dummy-model",
    name: "Training Dummy",
    primaryPartId: rootId,
    attributes: { Health: 100, MaxHealth: 100 },
    tags: ["Humanoid"],
  });
  fixture.animations = [
    {
      id: "swing",
      name: "LinkedSwordSwing",
      rigModelId: null,
      duration: 0.45,
      looped: false,
      keyframes: [],
    },
  ];
  fixture.scripts.push({
    id: "sword-script",
    name: "SwordClient",
    kind: "localScript",
    parent: toolId,
    source: `local tool = script.Parent
tool.Activated:Connect(function()
    Animations:Play("LinkedSwordSwing")
    Combat:DamageNearest(20, 6)
end)`,
  });

  const result = activatePolyTool(fixture, toolId);

  assert.deepEqual(result.animationRequests, ["LinkedSwordSwing"]);
  assert.equal(result.animationVersion, 1);
  assert.equal(result.project.models[0].attributes.Health, 80);
  assert.equal(
    result.project.objects.find((object) => object.id === rootId)?.attributes
      .Health,
    80,
  );
});

test("edits selective leaderstats and playtest data through commands", () => {
  const fixture = project();
  fixture.leaderstats = [
    { id: "coins", name: "Coins", type: "number", defaultValue: 0 },
  ];
  const runtime = runPolyProject(fixture);
  const withCoins = executePolyCommand(
    runtime,
    "leaderstats add local Coins 25",
  );
  const withData = executePolyCommand(
    withCoins,
    "data set PlayerData Level 4",
  );

  assert.equal(withData.project.leaderstats[0].defaultValue, 25);
  assert.equal(withData.project.dataStores.PlayerData.Level, 4);
});

test("runs TouchEnded handlers independently from Touched", () => {
  const fixture = project();
  fixture.scripts = [
    {
      id: "touch-ended",
      name: "TouchEnded",
      kind: "script",
      parent: "ServerScriptService",
      source: `local part = Workspace:FindFirstChild("Part")
part.TouchEnded:Connect(function(hit)
  part.Color = "#00FF00"
end)`,
    },
  ];

  const entered = activatePolyTouched(fixture, "part");
  const exited = activatePolyTouched(fixture, "part", "TouchEnded");

  assert.equal(entered.project.objects[0].color, "#342856");
  assert.equal(exited.project.objects[0].color, "#00FF00");
});

test("lets server scripts selectively add leaderstats", () => {
  const fixture = project();
  fixture.leaderstats = [
    { id: "coins", name: "Coins", type: "number", defaultValue: 5 },
  ];
  fixture.scripts = [
    {
      id: "leaderstats",
      name: "Rewards",
      kind: "script",
      parent: "ServerScriptService",
      source: 'Leaderstats:Add("lava", "Coins", 10)',
    },
  ];

  const result = runPolyProject(fixture);

  assert.equal(result.project.leaderstats[0].defaultValue, 15);
});
