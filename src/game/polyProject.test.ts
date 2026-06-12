import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzePolyScript,
  type PolyProject,
  runPolyProject,
} from "./polyProject";

function project(): PolyProject {
  return {
    version: 2,
    id: "11111111-1111-4111-8111-111111111111",
    name: "Runtime Test",
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
      walkSpeed: 18,
      jumpPower: 10.5,
      cameraFieldOfView: 55,
      maxHealth: 100,
    },
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
