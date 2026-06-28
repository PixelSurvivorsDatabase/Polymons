import assert from "node:assert/strict";
import test from "node:test";
import {
  cameraArrowDelta,
  movementAxis,
  normalizeJoystickAxis,
  shouldPreventGameplayDefault,
} from "./gameInput";
import {
  activatePolyGui,
  activatePolyInput,
  activatePolyTouched,
  activatePolyTool,
  analyzePolyScript,
  executePolyCommand,
  type PolyProject,
  resumePolyScheduledScript,
  runPolyProject,
  withRuntimePlayerPosition,
} from "./polyProject";
import { parseServerMessage } from "./multiplayer";
import { avatarThumbnailDataUrl } from "./avatarThumbnail";

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
      cameraMinZoomDistance: 10,
      cameraMaxZoomDistance: 80,
      maxHealth: 100,
    },
    leaderstats: [],
    animations: [],
    values: [],
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

test("applies LocalPlayer camera zoom limits from scripts", () => {
  const fixture = project();
  fixture.scripts[1].source = `local player = Players.LocalPlayer
player.CameraMinZoomDistance = 12
player.CameraMaxZoomDistance = 96`;
  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.project.playerSettings.cameraMinZoomDistance, 12);
  assert.equal(result.project.playerSettings.cameraMaxZoomDistance, 96);
});

test("supports Roblox-style leaderstats Value paths in remote callbacks", () => {
  const fixture = project();
  fixture.remotes = [{ id: "add-lava", name: "AddLava", kind: "remoteEvent" }];
  fixture.leaderstats = [
    {
      id: "lava-stat",
      name: "lava",
      type: "number",
      defaultValue: 0,
      showOnLeaderboard: true,
    },
    {
      id: "multiplier-stat",
      name: "Multiplier",
      type: "number",
      defaultValue: 2,
      showOnLeaderboard: true,
    },
  ];
  fixture.scripts = [
    {
      id: "server",
      name: "LavaServer",
      kind: "script",
      parent: "ServerScriptService",
      source: `local remote = ReplicatedStorage:FindFirstChild("AddLava")
remote.OnServerEvent:Connect(function(player, amount)
    player.leaderstats.lava.Value += amount
end)`,
    },
    {
      id: "client",
      name: "LavaClient",
      kind: "localScript",
      parent: "StarterPlayerScripts",
      source: `local player = Players.LocalPlayer
local remote = ReplicatedStorage:FindFirstChild("AddLava")
remote:FireServer(1 * player.Multiplier)`,
    },
  ];

  const result = runPolyProject(fixture);

  assert.equal(result.diagnostics.length, 0, JSON.stringify(result.diagnostics));
  assert.equal(result.project.leaderstats[0].defaultValue, 2);
});

test("supports hit.Parent player lookup and Humanoid TakeDamage", () => {
  const fixture = project();
  fixture.scripts = [
    {
      id: "damage-part",
      name: "DamagePart",
      kind: "script",
      parent: "part",
      source: `script.Parent.Touched:Connect(function(hit)
    local player = Players:GetPlayerFromCharacter(hit.Parent)
    if player then
        local humanoid = player.Character.Humanoid
        humanoid:TakeDamage(25)
    end
end)`,
    },
  ];

  const result = activatePolyTouched(fixture, "part");

  assert.equal(result.diagnostics.length, 0, JSON.stringify(result.diagnostics));
  assert.equal(result.project.playerSettings.health, 75);
});

test("applies project Lighting properties from scripts", () => {
  const fixture = project();
  fixture.scripts = [
    {
      id: "lighting-server",
      name: "LightingServer",
      kind: "script",
      parent: "ServerScriptService",
      source: `Lighting.ClockTime = 18
local lighting = Lighting
lighting.Brightness = 1.25
lighting.FogColor = "#6B7280"
lighting.FogStart = 40
lighting.FogEnd = 180
lighting.GlobalShadows = false
lighting.ShadowSoftness = 0.6`,
    },
  ];

  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0, JSON.stringify(result.diagnostics));
  assert.equal(result.project.lighting?.clockTime, 18);
  assert.equal(result.project.lighting?.brightness, 1.25);
  assert.equal(result.project.lighting?.fogColor, "#6B7280");
  assert.equal(result.project.lighting?.fogStart, 40);
  assert.equal(result.project.lighting?.fogEnd, 180);
  assert.equal(result.project.lighting?.globalShadows, false);
  assert.equal(result.project.lighting?.shadowSoftness, 0.6);
});

test("normalizes Sky settings and supports scripted celestial controls", () => {
  const fixture = project();
  fixture.lighting = {
    ...fixture.lighting!,
    dayNightCycle: true,
    dayLengthMinutes: 0.1,
    sunEnabled: true,
    moonEnabled: true,
    sunTextureData: "",
    moonTextureData: "",
    sunBrightness: 20,
    sunGlare: 4,
    sunRays: true,
    moonBrightness: 8,
    moonPhases: true,
    moonPhase: 2,
  };
  fixture.scripts = [
    {
      id: "sky-script",
      name: "SkyScript",
      kind: "script",
      parent: "ServerScriptService",
      source: `Lighting.DayNightCycle = false
Workspace.Sky.SunEnabled = false
Workspace.Sky.MoonPhase = 0.4`,
    },
  ];

  const result = runPolyProject(fixture);
  assert.equal(result.project.lighting?.dayLengthMinutes, 0.5);
  assert.equal(result.project.lighting?.sunBrightness, 8);
  assert.equal(result.project.lighting?.sunGlare, 2);
  assert.equal(result.project.lighting?.moonBrightness, 4);
  assert.equal(result.project.lighting?.dayNightCycle, false);
  assert.equal(result.project.lighting?.sunEnabled, false);
  assert.equal(result.project.lighting?.moonPhase, 0.4);
});

test("normalizes legacy blocks and scripts supported part shapes", () => {
  const fixture = project();
  fixture.scripts = [
    {
      id: "shape-server",
      name: "ShapeServer",
      kind: "script",
      parent: "ServerScriptService",
      source: `local part = Workspace.Part
part.Shape = "Sphere"`,
    },
  ];

  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0, JSON.stringify(result.diagnostics));
  assert.equal(result.project.objects[0].shape, "sphere");
});

test("normalizes camera zoom limits for older projects", () => {
  const fixture = project();
  const legacySettings = fixture.playerSettings as Partial<
    typeof fixture.playerSettings
  >;
  delete legacySettings.cameraMinZoomDistance;
  delete legacySettings.cameraMaxZoomDistance;
  const result = runPolyProject(fixture);
  assert.equal(result.project.playerSettings.cameraMinZoomDistance, 10);
  assert.equal(result.project.playerSettings.cameraMaxZoomDistance, 80);
});

test("keeps legacy leaderstats visible and preserves hidden stats", () => {
  const fixture = project();
  fixture.leaderstats = [
    {
      id: "lava",
      name: "lava",
      type: "number",
      defaultValue: 0,
    },
    {
      id: "multiplier",
      name: "Multiplier",
      type: "number",
      defaultValue: 1,
      showOnLeaderboard: false,
    },
  ];

  const result = runPolyProject(fixture);
  assert.equal(result.project.leaderstats[0].showOnLeaderboard, true);
  assert.equal(result.project.leaderstats[1].showOnLeaderboard, false);
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

test("dispatches FireServer to OnServerEvent and edits leaderstats", () => {
  const fixture = project();
  fixture.remotes = [
    {
      id: "coins-event",
      name: "GiveCoins",
      kind: "remoteEvent",
    },
  ];
  fixture.leaderstats = [
    { id: "coins", name: "Coins", type: "number", defaultValue: 0 },
  ];
  fixture.scripts = [
    {
      id: "coins-server",
      name: "CoinsServer",
      kind: "script",
      parent: "ServerScriptService",
      source: `local remote = ReplicatedStorage:FindFirstChild("GiveCoins")
remote.OnServerEvent:Connect(function(player, amount)
  Leaderstats:Add(player, "Coins", amount)
end)`,
    },
    {
      id: "coins-client",
      name: "CoinsButton",
      kind: "localScript",
      parent: "play-button",
      source: `local remote = ReplicatedStorage:FindFirstChild("GiveCoins")
script.Parent.Activated:Connect(function()
  remote:FireServer(10)
end)`,
    },
  ];
  fixture.gui.push({
    ...fixture.gui[1],
    id: "play-button",
    name: "GiveCoinsButton",
    type: "textButton",
    parentId: "screen",
  });

  const started = runPolyProject(fixture);
  const clicked = activatePolyGui(started.project, "play-button");

  assert.equal(started.project.leaderstats[0].defaultValue, 0);
  assert.equal(clicked.project.leaderstats[0].defaultValue, 10);
  assert.equal(clicked.diagnostics.length, 0);
});

test("uses player leaderstats in remote arithmetic and doubles multipliers", () => {
  const fixture = project();
  fixture.remotes = [
    {
      id: "click-event",
      name: "Clicker",
      kind: "remoteEvent",
    },
    {
      id: "upgrade-event",
      name: "Upgrade",
      kind: "remoteEvent",
    },
  ];
  fixture.leaderstats = [
    { id: "lava", name: "lava", type: "number", defaultValue: 30 },
    {
      id: "multiplier",
      name: "Multiplier",
      type: "number",
      defaultValue: 1,
      showOnLeaderboard: false,
    },
  ];
  fixture.scripts = [
    {
      id: "clicker-server",
      name: "ClickerServer",
      kind: "script",
      parent: "ServerScriptService",
      source: `local clicker = ReplicatedStorage.Clicker
local upgrade = ReplicatedStorage.Upgrade

clicker.OnServerEvent:Connect(function(player)
    Leaderstats:Add(player, "lava", 1 * player.Multiplier)
end)

upgrade.OnServerEvent:Connect(function(player)
    if player.lava >= 30 then
        Leaderstats:Add(player, "lava", -30)
        player.Multiplier = player.Multiplier * 2
    end
end)`,
    },
    {
      id: "clicker-client",
      name: "ClickerClient",
      kind: "localScript",
      parent: "StarterPlayerScripts",
      source: `ReplicatedStorage.Clicker:FireServer()
ReplicatedStorage.Upgrade:FireServer()`,
    },
  ];

  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0, JSON.stringify(result.diagnostics));
  assert.equal(
    result.project.leaderstats.find((stat) => stat.name === "lava")
      ?.defaultValue,
    1,
  );
  assert.equal(
    result.project.leaderstats.find((stat) => stat.name === "Multiplier")
      ?.defaultValue,
    2,
  );
});

test("returns OnServerInvoke values to C# LocalScripts", () => {
  const fixture = project();
  fixture.language = "csharp";
  fixture.remotes = [
    {
      id: "reward-function",
      name: "GetReward",
      kind: "remoteFunction",
    },
  ];
  fixture.leaderstats = [
    { id: "coins", name: "Coins", type: "number", defaultValue: 0 },
  ];
  fixture.scripts = [
    {
      id: "reward-server",
      name: "RewardServer",
      kind: "script",
      parent: "ServerScriptService",
      source: `var remote = ReplicatedStorage.Find("GetReward");
remote.OnServerInvoke = (player, amount) => {
  return amount;
};`,
    },
    {
      id: "reward-client",
      name: "RewardClient",
      kind: "localScript",
      parent: "StarterPlayerScripts",
      source: `var remote = ReplicatedStorage.Find("GetReward");
var player = Players.LocalPlayer;
var reward = remote.InvokeServer(35);
player.Coins = reward;`,
    },
  ];

  const result = runPolyProject(fixture);

  assert.equal(
    result.diagnostics.length,
    0,
    JSON.stringify(result.diagnostics, null, 2),
  );
  assert.equal(result.project.leaderstats[0].defaultValue, 35);
});

test("supports C++ OnServerEvent callbacks", () => {
  const fixture = project();
  fixture.language = "cpp";
  fixture.remotes = [
    {
      id: "coins-event",
      name: "GiveCoins",
      kind: "remoteEvent",
    },
  ];
  fixture.leaderstats = [
    { id: "coins", name: "Coins", type: "number", defaultValue: 1 },
  ];
  fixture.scripts = [
    {
      id: "coins-server",
      name: "CoinsServer",
      kind: "script",
      parent: "ServerScriptService",
      source: `auto remote = ReplicatedStorage.Find("GiveCoins");
remote.OnServerEvent.Connect([&](auto player, auto amount) {
  Leaderstats::Add(player, "Coins", amount);
});`,
    },
    {
      id: "coins-client",
      name: "CoinsClient",
      kind: "localScript",
      parent: "StarterPlayerScripts",
      source: `auto remote = ReplicatedStorage.Find("GiveCoins");
remote.FireServer(4);`,
    },
  ];

  const result = runPolyProject(fixture);

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.project.leaderstats[0].defaultValue, 5);
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

test("tracks concatenated local strings assigned to GUI text", () => {
  const fixture = project();
  fixture.leaderstats.push({
    id: "upgrade-price",
    name: "UpgradePrice",
    type: "number",
    defaultValue: 30,
    showOnLeaderboard: false,
  });
  fixture.gui.push({
    id: "upgrade-button",
    name: "UpgradeButton",
    type: "textButton",
    parentId: "screen",
    position: [0.4, 0.4],
    size: [0.2, 0.1],
    backgroundColor: "#6F49BB",
    backgroundTransparency: 0,
    text: "Upgrade",
    textColor: "#FFFFFF",
    visible: true,
    rotation: 0,
    textSize: 16,
    borderRadius: 7,
    zIndex: 2,
  });
  fixture.remotes.push({
    id: "upgrade-remote",
    name: "upgrade",
    kind: "remoteEvent",
  });
  const script = {
    id: "upgrade-client",
    name: "UpgradeClient",
    kind: "localScript" as const,
    parent: "upgrade-button",
    source: `local button = script.Parent
local player = Players.LocalPlayer
local upgrade = ReplicatedStorage.upgrade
local text = "Upgrade - " + player.UpgradePrice
text = text + " lava"
button.Text = text

upgrade.OnClientEvent:Connect(function(price)
    local updatedText = "Upgrade - " + price
    updatedText = updatedText + " lava"
    button.Text = updatedText
end)`,
  };
  fixture.scripts = [script];

  assert.deepEqual(analyzePolyScript(script, fixture), []);
  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.project.gui.at(-1)?.text, "Upgrade - 30 lava");

  fixture.scripts.push({
    id: "upgrade-server",
    name: "UpgradeServer",
    kind: "script",
    parent: "ServerScriptService",
    source: `local upgrade = ReplicatedStorage.upgrade
wait(0.01)
upgrade:FireAllClients(56)`,
  });
  const updated = runPolyProject(fixture);
  assert.equal(updated.diagnostics.length, 0);
  assert.equal(updated.project.gui.at(-1)?.text, "Upgrade - 30 lava");
  assert.equal(updated.scheduledScripts.length, 1);
  const delivered = resumePolyScheduledScript(
    updated.project,
    updated.scheduledScripts[0],
  );
  assert.equal(delivered.project.gui.at(-1)?.text, "Upgrade - 56 lava");
});

test("supports seeded math.random and Random generators", () => {
  const fixture = project();
  fixture.leaderstats = [
    { id: "first", name: "First", type: "number", defaultValue: 0 },
    { id: "second", name: "Second", type: "number", defaultValue: 0 },
    { id: "dice", name: "Dice", type: "number", defaultValue: 0 },
    { id: "integer", name: "Integer", type: "number", defaultValue: 0 },
    { id: "decimal", name: "Decimal", type: "number", defaultValue: 0 },
  ];
  fixture.scripts = [
    {
      id: "rng-server",
      name: "RngServer",
      kind: "script",
      parent: "ServerScriptService",
      source: `math.randomseed(242)
local first = math.random(10, 20)
math.randomseed(242)
local second = math.random(10, 20)
local dice = math.random(6)

local generator = Random.new(99)
local integer = generator:NextInteger(100, 200)
local decimal = generator:NextNumber(0.25, 0.75)

Leaderstats:Set("lava", "First", first)
Leaderstats:Set("lava", "Second", second)
Leaderstats:Set("lava", "Dice", dice)
Leaderstats:Set("lava", "Integer", integer)
Leaderstats:Set("lava", "Decimal", decimal)`,
    },
  ];

  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(
    result.project.leaderstats.find((stat) => stat.name === "First")?.defaultValue,
    result.project.leaderstats.find((stat) => stat.name === "Second")?.defaultValue,
  );
  const dice = Number(
    result.project.leaderstats.find((stat) => stat.name === "Dice")?.defaultValue,
  );
  const integer = Number(
    result.project.leaderstats.find((stat) => stat.name === "Integer")?.defaultValue,
  );
  const decimal = Number(
    result.project.leaderstats.find((stat) => stat.name === "Decimal")?.defaultValue,
  );
  assert.ok(dice >= 1 && dice <= 6);
  assert.ok(integer >= 100 && integer <= 200);
  assert.ok(decimal >= 0.25 && decimal <= 0.75);
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
    hit.Health = hit.Health - 25
    block.Transparency = 0.5
end)`,
    cpp: `#include <poly/server.hpp>
auto block = Script.Parent;
block.Touched.Connect([&](auto hit) {
    hit.Health = hit.Health - 25;
    block.Transparency = 0.5;
});`,
    csharp: `using Poly;
var block = Script.Parent;
block.Touched += (hit) => {
    hit.Health = hit.Health - 25;
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
    assert.equal(touched.project.playerSettings.health, 75, language);
  }
});

test("applies Touched damage again after the player respawns", () => {
  const fixture = project();
  fixture.scripts = [
    {
      id: "kill-part",
      name: "KillPart",
      kind: "script",
      parent: "part",
      source: `local block = script.Parent
block.Touched:Connect(function(hit)
    hit.Health = hit.Health - 100
end)`,
    },
  ];

  const firstTouch = activatePolyTouched(fixture, "part");
  assert.equal(firstTouch.project.playerSettings.health, 0);

  firstTouch.project.playerSettings.health =
    firstTouch.project.playerSettings.maxHealth;
  const secondTouch = activatePolyTouched(firstTouch.project, "part");
  assert.equal(secondTouch.project.playerSettings.health, 0);
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

test("applies image faces to parts from scripts", () => {
  const fixture = project();
  const image =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
  fixture.scripts[0].source = `local part = Workspace:FindFirstChild("Part")
part.Image = "${image}"
part.FrontImage = "${image}"`;

  const result = runPolyProject(fixture);
  const part = result.project.objects.find((object) => object.name === "Part");
  assert.equal(part?.imageFaces?.all, image);
  assert.equal(part?.imageFaces?.front, image);
});

test("requires an immutable game room id in multiplayer welcomes", () => {
  const player = {
    id: "connection-1",
    userId: "player-1",
    polymonsId: 2,
    username: "lava",
    displayName: "Lava",
    equippedShirtId: "polymon-shirt",
    equippedPantsId: "classic-denim-pants",
    equippedShirtTextureUrl:
      "https://fbzjxrybfooxttxbxgxc.supabase.co/storage/v1/object/public/avatar-item-textures/shirts/custom.png",
    equippedPantsTextureUrl:
      "https://fbzjxrybfooxttxbxgxc.supabase.co/storage/v1/object/public/avatar-item-textures/pants/custom.png",
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
  assert.equal(
    valid?.player.equippedShirtTextureUrl,
    player.equippedShirtTextureUrl,
  );
  assert.equal(missingRoom, null);
});

test("parses per-player leaderstat updates without sharing local values", () => {
  const update = parseServerMessage(
    JSON.stringify({
      type: "player_leaderstats",
      playerId: "connection-2",
      values: { lava: 42, Multiplier: 4 },
    }),
  );
  const oversized = parseServerMessage(
    JSON.stringify({
      type: "player_leaderstats",
      playerId: "connection-2",
      values: Object.fromEntries(
        Array.from({ length: 21 }, (_, index) => [`Stat ${index}`, index]),
      ),
    }),
  );

  assert.deepEqual(update, {
    type: "player_leaderstats",
    playerId: "connection-2",
    values: { lava: 42, Multiplier: 4 },
  });
  assert.equal(oversized, null);
});

test("exposes immutable account identity on LocalPlayer", () => {
  const fixture = project();
  fixture.scripts = [
    {
      id: "identity-client",
      name: "IdentityClient",
      kind: "localScript",
      parent: "StarterPlayerScripts",
      source: `local player = Players.LocalPlayer
local label = PlayerGui.Status
label.Text = player.Username`,
    },
  ];

  const result = runPolyProject(fixture, {
    userId: 2,
    username: "lava",
    displayName: "Lava",
  });

  assert.equal(result.playerData.userId, 2);
  assert.equal(result.project.gui.find((gui) => gui.id === "status")?.text, "lava");

  fixture.scripts[0].source = `local player = Players.LocalPlayer
player.UserId = 99`;
  const writeResult = runPolyProject(fixture, result.playerData);
  assert.ok(
    writeResult.diagnostics.some((diagnostic) =>
      diagnostic.message.includes("UserId is read-only"),
    ),
  );
});

test("uses numeric player UserId as a DataStore key", () => {
  const fixture = project();
  fixture.remotes = [
    {
      id: "save-event",
      name: "SavePlayer",
      kind: "remoteEvent",
    },
  ];
  fixture.scripts = [
    {
      id: "save-server",
      name: "SaveServer",
      kind: "script",
      parent: "ServerScriptService",
      source: `local store = DataStoreService:GetDataStore("PlayerData")
local remote = ReplicatedStorage.SavePlayer

remote.OnServerEvent:Connect(function(player)
    store:SetAsync(player.UserId, "saved")
end)`,
    },
    {
      id: "save-client",
      name: "SaveClient",
      kind: "localScript",
      parent: "StarterPlayerScripts",
      source: "ReplicatedStorage.SavePlayer:FireServer()",
    },
  ];

  const result = runPolyProject(fixture, {
    userId: 2,
    username: "lava",
    displayName: "Lava",
  });

  assert.equal(result.diagnostics.length, 0, JSON.stringify(result.diagnostics));
  assert.equal(result.project.dataStores.PlayerData?.["2"], "saved");
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
      position: [99, 3, 0],
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

  const result = activatePolyTool(
    withRuntimePlayerPosition(fixture, [0, 2, 0]),
    toolId,
  );

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

test("runs KeyCode input callbacks in Luau, C++, and C#", () => {
  const sources = {
    luau: `local part = Workspace:FindFirstChild("Part")
UserInputService.InputBegan:Connect(function(input)
  if input.KeyCode == Enum.KeyCode.E then
    part.Color = "#22CC88"
  end
end)`,
    cpp: `auto part = Workspace.Find("Part");
UserInputService.InputBegan.Connect([&](auto input) {
  if (input.KeyCode == KeyCode::E) {
    part.Color = "#22CC88";
  }
});`,
    csharp: `var part = Workspace.Find("Part");
UserInputService.InputBegan += (input) => {
  if (input.KeyCode == KeyCode.E) {
    part.Color = "#22CC88";
  }
};`,
  } as const;

  for (const [language, source] of Object.entries(sources)) {
    const fixture = project();
    fixture.language = language as PolyProject["language"];
    fixture.scripts = [
      {
        id: `input-${language}`,
        name: "InputClient",
        kind: "localScript",
        parent: "StarterPlayerScripts",
        source,
      },
    ];
    const ignored = activatePolyInput(fixture, "Q");
    assert.equal(ignored.project.objects[0].color, "#342856", language);
    const activated = activatePolyInput(fixture, "E");
    assert.equal(activated.diagnostics.length, 0, language);
    assert.equal(activated.project.objects[0].color, "#22CC88", language);
  }
});

test("dispatches FireAllClients to OnClientEvent", () => {
  const fixture = project();
  fixture.remotes = [
    { id: "notice", name: "Notice", kind: "remoteEvent" },
  ];
  fixture.scripts = [
    {
      id: "notice-server",
      name: "NoticeServer",
      kind: "script",
      parent: "ServerScriptService",
      source: `local remote = ReplicatedStorage:FindFirstChild("Notice")
remote:FireAllClients("#55AAFF")`,
    },
    {
      id: "notice-client",
      name: "NoticeClient",
      kind: "localScript",
      parent: "StarterPlayerScripts",
      source: `local remote = ReplicatedStorage:FindFirstChild("Notice")
local part = Workspace:FindFirstChild("Part")
remote.OnClientEvent:Connect(function(color)
  part.Color = color
end)`,
    },
  ];

  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.project.objects[0].color, "#55AAFF");
});

test("returns arithmetic from OnServerInvoke", () => {
  const fixture = project();
  fixture.remotes = [
    { id: "reward", name: "Reward", kind: "remoteFunction" },
  ];
  fixture.leaderstats = [
    { id: "coins", name: "Coins", type: "number", defaultValue: 0 },
  ];
  fixture.scripts = [
    {
      id: "reward-server",
      name: "RewardServer",
      kind: "script",
      parent: "ServerScriptService",
      source: `local remote = ReplicatedStorage:FindFirstChild("Reward")
remote.OnServerInvoke = function(player, amount)
  return amount * 2
end`,
    },
    {
      id: "reward-client",
      name: "RewardClient",
      kind: "localScript",
      parent: "StarterPlayerScripts",
      source: `local remote = ReplicatedStorage:FindFirstChild("Reward")
local player = Players.LocalPlayer
local reward = remote:InvokeServer(25)
player.Coins = reward`,
    },
  ];

  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.project.leaderstats[0].defaultValue, 50);
});

test("creates TweenService requests and applies final properties", () => {
  const fixture = project();
  fixture.scripts = [
    {
      id: "tween-script",
      name: "TweenScript",
      kind: "script",
      parent: "ServerScriptService",
      source: `local part = Workspace:FindFirstChild("Part")
local tween = TweenService:Create(part, TweenInfo.new(1.5, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Position = Vector3.new(8, 4, 2), Transparency = 0.5 })
tween:Play()`,
    },
  ];

  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0);
  assert.deepEqual(result.project.objects[0].position, [8, 4, 2]);
  assert.equal(result.project.objects[0].transparency, 0.5);
  assert.equal(result.tweenRequests.length, 1);
  assert.equal(result.tweenRequests[0].duration, 1.5);
  assert.equal(result.tweenRequests[0].easingStyle, "Quad");
});

test("supports editable and scriptable Part linear and angular velocity", () => {
  const fixture = project();
  fixture.scripts = [
    {
      id: "velocity-script",
      name: "VelocityScript",
      kind: "script",
      parent: "ServerScriptService",
      source: `local part = Workspace:FindFirstChild("Part")
part.Anchored = false
part.Velocity = Vector3.new(12, 3, -4)
part.AngularVelocity = Vector3.new(0, 2, 0)`,
    },
  ];

  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.project.objects[0].anchored, false);
  assert.deepEqual(result.project.objects[0].velocity, [12, 3, -4]);
  assert.deepEqual(result.project.objects[0].angularVelocity, [0, 2, 0]);
});

test("collects Sound playback requests and editable audio properties", () => {
  const fixture = project();
  fixture.objects.push({
    ...fixture.objects[0],
    id: "sound",
    name: "RoundStart",
    type: "sound",
    scale: [0.6, 0.6, 0.6],
    canCollide: false,
    castShadow: false,
    soundData: "data:audio/ogg;base64,T2dnUw==",
    soundFileName: "round-start.ogg",
    volume: 0.7,
    looped: false,
    playbackSpeed: 1,
    rolloffMinDistance: 5,
    rolloffMaxDistance: 60,
    autoplay: false,
  });
  fixture.scripts = [
    {
      id: "sound-script",
      name: "SoundScript",
      kind: "script",
      parent: "ServerScriptService",
      source: `local sound = Workspace:FindFirstChild("RoundStart")
sound.Volume = 0.4
sound.Looped = true
sound:Play()`,
    },
  ];

  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.project.objects[1].volume, 0.4);
  assert.equal(result.project.objects[1].looped, true);
  assert.deepEqual(
    result.soundRequests.map(({ objectId, action }) => ({ objectId, action })),
    [{ objectId: "sound", action: "play" }],
  );
});

test("plays Sound objects directly from their script parent in every language", () => {
  const sources = {
    luau: "script.Parent:Play()",
    cpp: "Script.Parent.Play();",
    csharp: "Script.Parent.Play();",
  } as const;

  for (const [language, source] of Object.entries(sources)) {
    const fixture = project();
    fixture.language = language as PolyProject["language"];
    fixture.objects.push({
      ...fixture.objects[0],
      id: `sound-${language}`,
      name: "DirectSound",
      type: "sound",
      soundData: "data:audio/ogg;base64,T2dnUw==",
    });
    fixture.scripts = [
      {
        id: `sound-script-${language}`,
        name: "SoundScript",
        kind: "script",
        parent: `sound-${language}`,
        source,
      },
    ];

    const result = runPolyProject(fixture);
    assert.equal(result.diagnostics.length, 0, language);
    assert.deepEqual(
      result.soundRequests.map(({ objectId, action }) => ({
        objectId,
        action,
      })),
      [{ objectId: `sound-${language}`, action: "play" }],
      language,
    );
  }
});

test("accepts lowercase Sound calls and shorthand without parentheses", () => {
  const sources = [
    "script.Parent:play()",
    "script.Parent:play",
    "script.Parent.Play();",
  ];

  for (const [index, source] of sources.entries()) {
    const fixture = project();
    fixture.objects.push({
      ...fixture.objects[0],
      id: `lowercase-sound-${index}`,
      name: "Clicksound",
      type: "sound",
      soundData: "data:audio/mpeg;base64,//uQZA==",
    });
    fixture.scripts = [
      {
        id: `lowercase-sound-script-${index}`,
        name: "ClickSoundScript",
        kind: "script",
        parent: `lowercase-sound-${index}`,
        source,
      },
    ];

    const result = runPolyProject(fixture);
    assert.equal(result.diagnostics.length, 0, source);
    assert.deepEqual(
      result.soundRequests.map(({ objectId, action }) => ({
        objectId,
        action,
      })),
      [{ objectId: `lowercase-sound-${index}`, action: "play" }],
      source,
    );
  }
});

test("creates a new Sound request for every key press", () => {
  const fixture = project();
  fixture.objects.push({
    ...fixture.objects[0],
    id: "key-sound",
    name: "KeySound",
    type: "sound",
    soundData: "data:audio/ogg;base64,T2dnUw==",
  });
  fixture.scripts = [
    {
      id: "key-sound-script",
      name: "KeySoundScript",
      kind: "localScript",
      parent: "StarterPlayerScripts",
      source: `local sound = Workspace:FindFirstChild("KeySound")
UserInputService.InputBegan:Connect(function(input)
    if input.KeyCode == Enum.KeyCode.F then
        sound:Play()
    end
end)`,
    },
  ];

  const first = activatePolyInput(fixture, "F");
  const second = activatePolyInput(first.project, "F");
  assert.equal(first.soundRequests.length, 1);
  assert.equal(second.soundRequests.length, 1);
  assert.notEqual(first.soundRequests[0].id, second.soundRequests[0].id);
});

test("resolves nested Parent and sibling paths", () => {
  const fixture = project();
  fixture.gui = [
    {
      ...fixture.gui[0],
      id: "screen",
      name: "ShopGui",
    },
    {
      ...fixture.gui[1],
      id: "button",
      name: "OpenButton",
      type: "textButton",
      parentId: "screen",
    },
    {
      ...fixture.gui[1],
      id: "panel",
      name: "ShopPanel",
      parentId: "screen",
      visible: false,
    },
  ];
  fixture.scripts = [
    {
      id: "nested-parent",
      name: "NestedParent",
      kind: "localScript",
      parent: "button",
      source: `local panel = script.Parent.Parent.ShopPanel
panel.Visible = true`,
    },
  ];

  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.project.gui.find((item) => item.id === "panel")?.visible, true);
});

test("runs Value objects through conditionals, wait, and bounded loops", () => {
  const fixture = project();
  fixture.values = [
    {
      id: "enabled",
      name: "Enabled",
      type: "boolValue",
      parent: "ReplicatedStorage",
      value: false,
    },
    {
      id: "count",
      name: "Count",
      type: "numberValue",
      parent: "ReplicatedStorage",
      value: 0,
    },
    {
      id: "state",
      name: "State",
      type: "stringValue",
      parent: "ReplicatedStorage",
      value: "idle",
    },
  ];
  fixture.scripts = [
    {
      id: "control-flow",
      name: "ControlFlow",
      kind: "script",
      parent: "ServerScriptService",
      source: `local enabled = ReplicatedStorage.Enabled
local count = ReplicatedStorage.Count
local state = ReplicatedStorage.State

if enabled.Value == false then
    enabled.Value = true
end

for i = 1, 3 do
    count.Value = count.Value + 1
    wait()
end

local steps = 0
while steps < 2 do
    steps += 1
    count.Value = count.Value + 2
end

repeat
    steps -= 1
    task.wait(0.1)
until steps == 0

if false then
    state.Value = "wrong"
elseif count.Value == 7 then
    state.Value = "ready"
else
    state.Value = "wrong"
end`,
    },
  ];

  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0, JSON.stringify(result.diagnostics));
  assert.equal(result.project.values.find((item) => item.id === "enabled")?.value, true);
  assert.equal(result.project.values.find((item) => item.id === "count")?.value, 7);
  assert.equal(result.project.values.find((item) => item.id === "state")?.value, "ready");
});

test("wait schedules the remaining script and resumes with local references", () => {
  const fixture = project();
  fixture.values = [
    {
      id: "state",
      name: "State",
      type: "stringValue",
      parent: "ReplicatedStorage",
      value: "idle",
    },
  ];
  fixture.scripts = [
    {
      id: "wait-script",
      name: "WaitScript",
      kind: "script",
      parent: "ServerScriptService",
      source: `local state = ReplicatedStorage.State
state.Value = "before"
wait(0.25)
state.Value = "after"`,
    },
  ];

  const initial = runPolyProject(fixture);
  assert.equal(
    initial.project.values.find((item) => item.id === "state")?.value,
    "before",
  );
  assert.equal(initial.scheduledScripts.length, 1);
  assert.equal(initial.scheduledScripts[0].delayMs, 250);

  const resumed = resumePolyScheduledScript(
    initial.project,
    initial.scheduledScripts[0],
    initial.playerData,
  );
  assert.equal(
    resumed.project.values.find((item) => item.id === "state")?.value,
    "after",
  );
});

test("resumes Sound playback after wait inside a button callback", () => {
  const fixture = project();
  fixture.objects.push({
    id: "wait-sound",
    name: "Clicksound",
    type: "sound",
    soundData: "data:audio/mpeg;base64,//uQZA==",
  });
  fixture.gui.push({
    id: "wait-sound-button",
    name: "SoundButton",
    type: "textButton",
    parent: "StarterGui",
    text: "Play",
  });
  fixture.scripts = [
    {
      id: "wait-sound-script",
      name: "WaitSoundScript",
      kind: "localScript",
      parent: "wait-sound-button",
      source: `local sound = Workspace.Clicksound
script.Parent.Activated:Connect(function()
  sound:play()
  wait(0.05)
  sound:play()
end)`,
    },
  ];

  const initial = activatePolyGui(fixture, "wait-sound-button");
  assert.deepEqual(
    initial.soundRequests.map(({ objectId, action }) => ({ objectId, action })),
    [{ objectId: "wait-sound", action: "play" }],
  );
  assert.equal(initial.scheduledScripts.length, 1);
  assert.equal(initial.scheduledScripts[0].delayMs, 50);

  const resumed = resumePolyScheduledScript(
    initial.project,
    initial.scheduledScripts[0],
    initial.playerData,
  );
  assert.deepEqual(
    resumed.soundRequests.map(({ objectId, action }) => ({ objectId, action })),
    [{ objectId: "wait-sound", action: "play" }],
  );
});

test("uses direct child paths and local child chains in button callbacks", () => {
  const fixture = project();
  fixture.objects.push(
    {
      ...fixture.objects[0],
      id: "audio-folder",
      name: "Audio",
    },
    {
      ...fixture.objects[0],
      id: "button-sound",
      name: "ClickSound",
      type: "sound",
      parentId: "audio-folder",
      soundData: "data:audio/ogg;base64,T2dnUw==",
    },
  );
  fixture.gui = [
    {
      ...fixture.gui[0],
      id: "screen",
      name: "Hud",
    },
    {
      ...fixture.gui[1],
      id: "play-button",
      name: "PlayButton",
      type: "textButton",
      parentId: "screen",
    },
  ];
  fixture.scripts = [
    {
      id: "direct-button",
      name: "DirectButton",
      kind: "localScript",
      parent: "play-button",
      source: `local audio = Workspace.Audio
local sound = audio.ClickSound

script.Parent.Activated:Connect(function()
    sound:Play()
end)`,
    },
  ];

  const result = activatePolyGui(fixture, "play-button");
  assert.equal(result.diagnostics.length, 0, JSON.stringify(result.diagnostics));
  assert.deepEqual(
    result.soundRequests.map(({ objectId, action }) => ({ objectId, action })),
    [{ objectId: "button-sound", action: "play" }],
  );
});

test("uses direct service paths inside OnServerEvent", () => {
  const fixture = project();
  fixture.objects.push(
    {
      ...fixture.objects[0],
      id: "server-audio",
      name: "ServerAudio",
    },
    {
      ...fixture.objects[0],
      id: "remote-sound",
      name: "Alert",
      type: "sound",
      parentId: "server-audio",
      soundData: "data:audio/ogg;base64,T2dnUw==",
    },
  );
  fixture.remotes = [
    {
      id: "play-sound-remote",
      name: "PlaySound",
      kind: "remoteEvent",
    },
  ];
  fixture.scripts = [
    {
      id: "direct-server",
      name: "DirectServer",
      kind: "script",
      parent: "ServerScriptService",
      source: `ReplicatedStorage.PlaySound.OnServerEvent:Connect(function(player)
    Workspace.ServerAudio.Alert:Play()
end)`,
    },
    {
      id: "direct-client",
      name: "DirectClient",
      kind: "localScript",
      parent: "StarterPlayerScripts",
      source: "ReplicatedStorage.PlaySound:FireServer()",
    },
  ];

  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0, JSON.stringify(result.diagnostics));
  assert.deepEqual(
    result.soundRequests.map(({ objectId, action }) => ({ objectId, action })),
    [{ objectId: "remote-sound", action: "play" }],
  );
});

test("generates avatar thumbnails from equipped clothing and body colors", () => {
  const denim = avatarThumbnailDataUrl({
    username: "lava",
    displayName: "lava",
    equippedShirtId: "polymon-shirt",
    equippedPantsId: "classic-denim-pants",
  });
  const polymonPants = avatarThumbnailDataUrl({
    username: "lava",
    displayName: "lava",
    equippedShirtId: "polymon-shirt",
    equippedPantsId: "polymon-pants",
  });

  assert.match(denim, /^data:image\/svg\+xml/);
  assert.notEqual(denim, polymonPants);
});

test("creates, clones, parents, and destroys runtime parts", () => {
  const fixture = project();
  fixture.scripts = [
    {
      id: "object-lifecycle",
      name: "ObjectLifecycle",
      kind: "script",
      parent: "ServerScriptService",
      source: `local created = Instance.new("Part")
created.Name = "Runtime Part"
created.Parent = Workspace
local clone = created:Clone()
clone.Name = "Runtime Clone"
created:Destroy()`,
    },
  ];

  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0, JSON.stringify(result.diagnostics));
  assert.equal(
    result.project.objects.some((object) => object.name === "Runtime Part"),
    false,
  );
  assert.equal(
    result.project.objects.some((object) => object.name === "Runtime Clone"),
    true,
  );
});

test("runs server-created hitboxes with Touched damage", () => {
  const fixture = project();
  fixture.remotes = [
    {
      id: "swing-remote",
      name: "Swing",
      kind: "remoteEvent",
    },
  ];
  fixture.scripts = [
    {
      id: "sword-server",
      name: "SwordServer",
      kind: "script",
      parent: "ServerScriptService",
      source: `local swing = ReplicatedStorage.Swing
local damage = 25

swing.OnServerEvent:Connect(function(player)
    local character = player.Character
    local root = character.HumanoidRootPart
    local hitbox = Instance.new("Part")
    hitbox.Name = "SwordHitbox"
    hitbox.Size = Vector3.new(5, 4, 5)
    hitbox.CanCollide = false
    hitbox.Anchored = true
    hitbox.Position = root.Position + root.LookVector * 4
    hitbox.Touched:Connect(function(hit)
        local targetCharacter = hit.Parent
        local humanoid = targetCharacter.Humanoid
        local targetPlayer = Players:GetPlayerFromCharacter(targetCharacter)
        if targetPlayer == player then
            return
        end
        humanoid.Health = humanoid.Health - damage
    end)
    hitbox.Parent = Workspace
    hitbox:Destroy()
end)`,
    },
    {
      id: "sword-client",
      name: "SwordClient",
      kind: "localScript",
      parent: "StarterPlayerScripts",
      source: `local swing = ReplicatedStorage.Swing
swing:FireServer()`,
    },
  ];

  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0, JSON.stringify(result.diagnostics));
  assert.equal(result.project.playerSettings.health, 100);
  assert.equal(result.project.dataStores.__poly_runtime__?.OtherPlayerHealth, 75);
  assert.equal(
    result.project.objects.some((object) => object.name === "SwordHitbox"),
    false,
  );
});

test("supports player loops and vector magnitude range checks", () => {
  const fixture = project();
  fixture.remotes = [
    {
      id: "range-remote",
      name: "RangeCheck",
      kind: "remoteEvent",
    },
  ];
  fixture.scripts = [
    {
      id: "range-check",
      name: "RangeCheck",
      kind: "script",
      parent: "ServerScriptService",
      source: `local rangeCheck = ReplicatedStorage.RangeCheck

rangeCheck.OnServerEvent:Connect(function(player)
local root = player.Character.HumanoidRootPart
for _, otherPlayer in pairs(Players:GetPlayers()) do
    if otherPlayer ~= player then
        local otherRoot = otherPlayer.Character.HumanoidRootPart
        if (root.Position - otherRoot.Position).Magnitude <= 8 then
            local humanoid = otherPlayer.Character.Humanoid
            humanoid.Health = humanoid.Health - 10
        end
    end
end
end)`,
    },
    {
      id: "range-client",
      name: "RangeClient",
      kind: "localScript",
      parent: "StarterPlayerScripts",
      source: "ReplicatedStorage.RangeCheck:FireServer()",
    },
  ];

  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0, JSON.stringify(result.diagnostics));
  assert.equal(result.project.dataStores.__poly_runtime__?.OtherPlayerHealth, 90);
});

test("teleports all players with Players:GetPlayers round scripts", () => {
  const fixture = project();
  fixture.objects.push({
    ...fixture.objects[0],
    id: "lobby-spawn",
    name: "LobbySpawn",
    position: [12, 6, -8],
    scale: [4, 1, 4],
  });
  fixture.scripts = [
    {
      id: "round-manager",
      name: "RoundManager",
      kind: "script",
      parent: "ServerScriptService",
      source: `local lobbySpawn = Workspace.LobbySpawn

for _, player in Players:GetPlayers() do
    local root = player.Character.HumanoidRootPart
    root.Position = lobbySpawn.Position
end`,
    },
  ];

  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0, JSON.stringify(result.diagnostics));
  assert.deepEqual(
    result.project.dataStores.__poly_runtime__?.LocalPlayerPosition,
    [12, 6, -8],
  );
  assert.deepEqual(
    result.project.dataStores.__poly_runtime__?.OtherPlayerPosition,
    [12, 6, -8],
  );
});

test("schedules task.delay and requests configured badges", () => {
  const fixture = project();
  fixture.badges = [
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "First Click",
      description: "Clicked once.",
    },
  ];
  fixture.scripts = [
    {
      id: "badge-delay",
      name: "BadgeDelay",
      kind: "script",
      parent: "ServerScriptService",
      source: `Badges:Award(player, "First Click")
task.delay(0.1, function()
    print("later")
end)`,
    },
  ];

  const result = runPolyProject(fixture);
  assert.equal(result.diagnostics.length, 0, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.badgeAwards, ["First Click"]);
  assert.equal(result.scheduledScripts.length, 1);
  assert.equal(result.scheduledScripts[0].delayMs, 100);
});
test("prevents browser shortcuts from hijacking gameplay movement", () => {
  for (const code of [
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "KeyR",
    "Space",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "ControlLeft",
    "ControlRight",
  ]) {
    assert.equal(shouldPreventGameplayDefault(code), true);
  }
  assert.equal(shouldPreventGameplayDefault("KeyF"), false);
});

test("rotates the camera continuously from held horizontal arrow keys", () => {
  const left = cameraArrowDelta(true, false, 0.5, false);
  const invertedLeft = cameraArrowDelta(true, false, 0.5, true);

  assert.ok(left > 1);
  assert.equal(invertedLeft, -left);
});

test("uses vertical arrow keys as alternate forward movement", () => {
  assert.equal(movementAxis(false, false, true, false, 0), 1);
  assert.equal(movementAxis(false, false, false, true, 0), -1);
  assert.equal(movementAxis(true, false, false, true, 0), 0);
});

test("normalizes mobile joystick input with a stable dead zone", () => {
  assert.equal(normalizeJoystickAxis(0.1), 0);
  assert.equal(normalizeJoystickAxis(-0.14), 0);
  assert.equal(normalizeJoystickAxis(1), 1);
  assert.equal(normalizeJoystickAxis(-1), -1);
  assert.ok(normalizeJoystickAxis(0.5) > 0.4);
  assert.ok(normalizeJoystickAxis(0.5) < 0.5);
});
