from __future__ import annotations

from collections.abc import Iterable

from advanced_curriculum import advanced_curriculum

STATS = ("Coins", "Lava", "Wins", "Points", "Gems", "Score")
REMOTES = ("Click", "Upgrade", "Reward", "Damage", "Purchase", "Roll")
KEYS = ("E", "F", "Q", "R", "G", "X")
PARTS = ("Hazard", "RewardPad", "Door", "Spinner", "LaunchPad", "Finish")
SOUNDS = ("ClickSound", "RewardSound", "Alert", "RoundStart", "Success")
COLORS = ("#55AAFF", "#22CC88", "#B45CFF", "#FF7755", "#FFD166")
MATERIALS = ("plastic", "metal", "wood", "neon")


def sample(language: str, topic: str, text: str) -> dict[str, str]:
    return {
        "language": language,
        "topic": topic,
        "text": text.strip(),
        "source": f"synthetic-curriculum:{topic}",
    }


def luau_curriculum(index: int) -> Iterable[dict[str, str]]:
    stat = STATS[index % len(STATS)]
    second_stat = STATS[(index + 2) % len(STATS)]
    remote = REMOTES[index % len(REMOTES)]
    part = PARTS[index % len(PARTS)]
    sound = SOUNDS[index % len(SOUNDS)]
    key = KEYS[index % len(KEYS)]
    color = COLORS[index % len(COLORS)]
    material = MATERIALS[index % len(MATERIALS)]
    amount = 1 + (index * 7) % 40
    damage = 5 + (index * 5) % 45
    price = 10 + (index * 13) % 190
    multiplier = 2 + index % 4
    seed = 100 + index * 17
    minimum = 1 + index % 8
    maximum = minimum + 5 + index % 20
    duration = 0.2 + (index % 8) * 0.1
    transparency = (index % 6) * 0.1
    x = (index * 3) % 21 - 10
    y = 2 + index % 10
    z = (index * 5) % 21 - 10

    yield sample(
        "luau",
        "remote-click",
        f'''
local button = script.Parent
local remote = ReplicatedStorage:FindFirstChild("{remote}")

button.Activated:Connect(function()
    remote:FireServer({amount})
end)
''',
    )
    yield sample(
        "luau",
        "leaderstat-server",
        f'''
local remote = ReplicatedStorage:FindFirstChild("{remote}")

remote.OnServerEvent:Connect(function(player, value)
    if value > 0 then
        Leaderstats:Add(player, "{stat}", value)
    end
end)
''',
    )
    yield sample(
        "luau",
        "clicker-upgrade",
        f'''
local click = ReplicatedStorage:FindFirstChild("{remote}")
local upgrade = ReplicatedStorage:FindFirstChild("Upgrade{stat}")

click.OnServerEvent:Connect(function(player)
    Leaderstats:Add(player, "{stat}", player.Multiplier)
end)

upgrade.OnServerEvent:Connect(function(player)
    if player.{stat} >= {price} then
        Leaderstats:Add(player, "{stat}", -{price})
        player.Multiplier = player.Multiplier * {multiplier}
        upgrade:FireClient(player, {price * multiplier})
    end
end)
''',
    )
    yield sample(
        "luau",
        "gui-price-update",
        f'''
local button = script.Parent
local player = Players.LocalPlayer
local upgrade = ReplicatedStorage:FindFirstChild("Upgrade{stat}")

local text = "Upgrade - " + player.UpgradePrice
text = text + " {stat.lower()}"
button.Text = text

button.Activated:Connect(function()
    upgrade:FireServer()
end)

upgrade.OnClientEvent:Connect(function(nextPrice)
    local updatedText = "Upgrade - " + nextPrice
    updatedText = updatedText + " {stat.lower()}"
    button.Text = updatedText
end)
''',
    )
    yield sample(
        "luau",
        "rng-reward",
        f'''
local roll = ReplicatedStorage:FindFirstChild("Roll{stat}")

roll.OnServerEvent:Connect(function(player)
    math.randomseed(player.UserId + {seed})
    local reward = math.random({minimum}, {maximum})
    Leaderstats:Add(player, "{stat}", reward)
end)
''',
    )
    yield sample(
        "luau",
        "rng-generator",
        f'''
local roll = ReplicatedStorage:FindFirstChild("Rare{stat}")

roll.OnServerEvent:Connect(function(player)
    local rng = Random.new(player.UserId + {seed})
    local reward = rng:NextInteger({minimum}, {maximum})
    local chance = rng:NextNumber(0.1, 0.9)

    if chance >= 0.5 then
        Leaderstats:Add(player, "{stat}", reward)
    else
        Leaderstats:Add(player, "{second_stat}", 1)
    end
end)
''',
    )
    yield sample(
        "luau",
        "touch-damage",
        f'''
local hazard = script.Parent

hazard.Touched:Connect(function(hit)
    local player = hit.Parent
    if player.Health > 0 then
        player.Health = player.Health - {damage}
    end
end)
''',
    )
    yield sample(
        "luau",
        "touch-reward",
        f'''
local pad = Workspace:FindFirstChild("{part}")

pad.Touched:Connect(function(hit)
    local player = hit.Parent
    if player.Health > 0 then
        Leaderstats:Add(player, "{stat}", {amount})
        pad.Color = "{color}"
    end
end)
''',
    )
    yield sample(
        "luau",
        "input-sound",
        f'''
local sound = Workspace:FindFirstChild("{sound}")

UserInputService.InputBegan:Connect(function(input)
    if input.KeyCode == Enum.KeyCode.{key} then
        sound:Play()
    end
end)
''',
    )
    yield sample(
        "luau",
        "button-sound",
        f'''
local button = script.Parent
local sound = Workspace:FindFirstChild("{sound}")

button.Activated:Connect(function()
    sound:Play()
    wait({duration:.1f})
    sound:Stop()
end)
''',
    )
    yield sample(
        "luau",
        "tween-part",
        f'''
local part = Workspace:FindFirstChild("{part}")
local tween = TweenService:Create(part, TweenInfo.new({duration:.1f}, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {{
    Position = Vector3.new({x}, {y}, {z}),
    Transparency = {transparency:.1f}
}})
tween:Play()
''',
    )
    yield sample(
        "luau",
        "part-properties",
        f'''
local part = Workspace:FindFirstChild("{part}")
part.Color = "{color}"
part.Material = "{material}"
part.Anchored = {str(index % 2 == 0).lower()}
part.CanCollide = {str(index % 3 != 0).lower()}
part.Position = Vector3.new({x}, {y}, {z})
part.Rotation = Vector3.new(0, {(index * 15) % 360}, 0)
''',
    )
    yield sample(
        "luau",
        "velocity",
        f'''
local part = Workspace:FindFirstChild("{part}")
part.Anchored = false
part.Velocity = Vector3.new({x}, {y}, {z})
part.AngularVelocity = Vector3.new(0, {1 + index % 8}, 0)
''',
    )
    yield sample(
        "luau",
        "datastore-save",
        f'''
local store = DataStoreService:GetDataStore("{stat}Data")
local save = ReplicatedStorage:FindFirstChild("Save{stat}")

save.OnServerEvent:Connect(function(player)
    local key = player.UserId
    local saved = store:GetAsync(key)

    if saved == nil then
        saved = {amount}
    end

    store:SetAsync(key, saved + {amount})
end)
''',
    )
    yield sample(
        "luau",
        "remote-function",
        f'''
local rewardFunction = ReplicatedStorage:FindFirstChild("Get{stat}")

rewardFunction.OnServerInvoke = function(player, baseValue)
    if baseValue > 0 then
        return baseValue * player.Multiplier
    end
    return 0
end
''',
    )
    yield sample(
        "luau",
        "remote-function-client",
        f'''
local rewardFunction = ReplicatedStorage:FindFirstChild("Get{stat}")
local player = Players.LocalPlayer
local reward = rewardFunction:InvokeServer({amount})
player.{stat} = reward
''',
    )
    yield sample(
        "luau",
        "loops",
        f'''
local part = Workspace:FindFirstChild("{part}")

for step = 1, {3 + index % 8} do
    part.Rotation = part.Rotation + Vector3.new(0, {5 + index % 30}, 0)
    task.wait({duration:.1f})
end
''',
    )
    yield sample(
        "luau",
        "attributes-tags",
        f'''
local part = Workspace:FindFirstChild("{part}")
part:SetAttribute("Reward", {amount})
part:SetAttribute("Enabled", true)
CollectionService:AddTag(part, "{stat}Source")
''',
    )
    yield sample(
        "luau",
        "lighting",
        f'''
Lighting.ClockTime = {index % 24}
Lighting.Brightness = {1 + index % 4}
Lighting.DayNightCycle = {str(index % 2 == 0).lower()}
Workspace.Sky.SunEnabled = {str(index % 3 != 0).lower()}
Workspace.Sky.MoonEnabled = true
''',
    )
    yield sample(
        "luau",
        "gui-visibility",
        f'''
local button = script.Parent
local panel = button.Parent.ShopPanel

button.Activated:Connect(function()
    if panel.Visible then
        panel.Visible = false
    else
        panel.Visible = true
    end
end)
''',
    )
    yield sample(
        "luau",
        "player-settings",
        f'''
local player = Players.LocalPlayer
player.WalkSpeed = {16 + index % 20}
player.JumpPower = {8 + index % 12}
player.CameraFieldOfView = {45 + index % 35}
player.SprintEnabled = {str(index % 2 == 0).lower()}
player.SprintMultiplier = {1 + (index % 8) * 0.25:.2f}
''',
    )
    yield sample(
        "luau",
        "tool-combat",
        f'''
local tool = script.Parent

tool.Activated:Connect(function()
    Animations:Play("Swing{1 + index % 4}")
    Combat:DamageNearest({damage}, {4 + index % 5})
end)
''',
    )


def cpp_curriculum(index: int) -> Iterable[dict[str, str]]:
    stat = STATS[index % len(STATS)]
    remote = REMOTES[index % len(REMOTES)]
    part = PARTS[index % len(PARTS)]
    amount = 1 + (index * 7) % 40
    damage = 5 + (index * 5) % 45
    x = (index * 3) % 21 - 10
    y = 2 + index % 10

    yield sample(
        "cpp",
        "remote-click",
        f'''
#include <poly/client.hpp>
auto button = Script.Parent;
auto remote = ReplicatedStorage.Find("{remote}");
button.Activated.Connect([&]() {{
    remote.FireServer({amount});
}});
''',
    )
    yield sample(
        "cpp",
        "leaderstat-server",
        f'''
#include <poly/server.hpp>
auto remote = ReplicatedStorage.Find("{remote}");
remote.OnServerEvent.Connect([&](auto player, auto value) {{
    if (value > 0) {{
        Leaderstats::Add(player, "{stat}", value);
    }}
}});
''',
    )
    yield sample(
        "cpp",
        "touch-damage",
        f'''
auto block = Script.Parent;
block.Touched.Connect([&](auto hit) {{
    if (hit.Health > 0) {{
        hit.Health = hit.Health - {damage};
    }}
}});
''',
    )
    yield sample(
        "cpp",
        "part-properties",
        f'''
auto part = Workspace.Find("{part}");
part.Position = Vector3({x}, {y}, 0);
part.Rotation = Vector3(0, {(index * 15) % 360}, 0);
part.CanCollide = {str(index % 2 == 0).lower()};
''',
    )
    yield sample(
        "cpp",
        "remote-function",
        f'''
auto remote = ReplicatedStorage.Find("Get{stat}");
remote.OnServerInvoke = [&](auto player, auto value) {{
    return value * {2 + index % 4};
}};
''',
    )
    yield sample(
        "cpp",
        "tween-part",
        f'''
auto part = Workspace.Find("{part}");
auto tween = TweenService::Create(
    part,
    TweenInfo(0.5, EasingStyle::Quad, EasingDirection::Out),
    {{ Position = Vector3({x}, {y}, 0) }}
);
tween.Play();
''',
    )
    yield sample(
        "cpp",
        "tool-combat",
        f'''
auto tool = Script.Parent;
tool.Activated.Connect([&]() {{
    Animations::Play("Swing{1 + index % 4}");
    Combat::DamageNearest({damage}, {4 + index % 5});
}});
''',
    )


def csharp_curriculum(index: int) -> Iterable[dict[str, str]]:
    stat = STATS[index % len(STATS)]
    remote = REMOTES[index % len(REMOTES)]
    part = PARTS[index % len(PARTS)]
    amount = 1 + (index * 7) % 40
    damage = 5 + (index * 5) % 45
    x = (index * 3) % 21 - 10
    y = 2 + index % 10

    yield sample(
        "csharp",
        "remote-click",
        f'''
using Poly;
var button = Script.Parent;
var remote = ReplicatedStorage.Find("{remote}");
button.Activated += () => {{
    remote.FireServer({amount});
}};
''',
    )
    yield sample(
        "csharp",
        "leaderstat-server",
        f'''
using Poly;
var remote = ReplicatedStorage.Find("{remote}");
remote.OnServerEvent += (player, value) => {{
    if (value > 0) {{
        Leaderstats.Add(player, "{stat}", value);
    }}
}};
''',
    )
    yield sample(
        "csharp",
        "touch-damage",
        f'''
var block = Script.Parent;
block.Touched += (hit) => {{
    if (hit.Health > 0) {{
        hit.Health = hit.Health - {damage};
    }}
}};
''',
    )
    yield sample(
        "csharp",
        "part-properties",
        f'''
var part = Workspace.Find("{part}");
part.Position = new Vector3({x}, {y}, 0);
part.Rotation = new Vector3(0, {(index * 15) % 360}, 0);
part.CanCollide = {str(index % 2 == 0).lower()};
''',
    )
    yield sample(
        "csharp",
        "remote-function",
        f'''
var remote = ReplicatedStorage.Find("Get{stat}");
remote.OnServerInvoke = (player, value) => {{
    return value * {2 + index % 4};
}};
''',
    )
    yield sample(
        "csharp",
        "tween-part",
        f'''
var part = Workspace.Find("{part}");
var tween = TweenService.Create(
    part,
    new TweenInfo(0.5, EasingStyle.Quad, EasingDirection.Out),
    new {{ Position = new Vector3({x}, {y}, 0) }}
);
tween.Play();
''',
    )
    yield sample(
        "csharp",
        "tool-combat",
        f'''
var tool = Script.Parent;
tool.Activated += () => {{
    Animations.Play("Swing{1 + index % 4}");
    Combat.DamageNearest({damage}, {4 + index % 5});
}};
''',
    )


def completion_curriculum(index: int) -> Iterable[dict[str, str]]:
    stat = STATS[index % len(STATS)]
    remote = REMOTES[index % len(REMOTES)]
    amount = 1 + index % 50
    price = 15 + (index * 9) % 250
    damage = 5 + (index * 4) % 70
    minimum = 1 + index % 5
    maximum = minimum + 5 + index % 15

    yield sample(
        "luau",
        "completion-click",
        f'''
local button = script.Parent
local remote = ReplicatedStorage:FindFirstChild("{remote}{stat}")

button.Activated:Connect(function()
    remote:FireServer({amount})
end)
''',
    )
    yield sample(
        "luau",
        "completion-rng",
        f'''
local roll = ReplicatedStorage:FindFirstChild("Roll{stat}")

roll.OnServerEvent:Connect(function(player)
    local reward = math.random({minimum}, {maximum})
    Leaderstats:Add(player, "{stat}", reward)
end)
''',
    )
    yield sample(
        "luau",
        "completion-gui",
        f'''
local button = script.Parent
local player = Players.LocalPlayer
local upgrade = ReplicatedStorage:FindFirstChild("Upgrade{stat}")

local text = "Upgrade - " + player.UpgradePrice
text = text + " {stat.lower()}"
button.Text = text

button.Activated:Connect(function()
    upgrade:FireServer()
end)

upgrade.OnClientEvent:Connect(function(nextPrice)
    local updatedText = "Upgrade - " + nextPrice
    updatedText = updatedText + " {stat.lower()}"
    button.Text = updatedText
end)
''',
    )
    yield sample(
        "luau",
        "completion-touch",
        f'''
local hazard = script.Parent

hazard.Touched:Connect(function(hit)
    local player = hit.Parent
    if player.Health > 0 then
        player.Health = player.Health - {damage}
    end
end)
''',
    )
    yield sample(
        "luau",
        "completion-function",
        f'''
local rewardFunction = ReplicatedStorage:FindFirstChild("Get{stat}")

rewardFunction.OnServerInvoke = function(player, baseValue)
    if baseValue > 0 then
        return baseValue * {2 + index % 5}
    end
    return 0
end
''',
    )
    yield sample(
        "luau",
        "completion-upgrade",
        f'''
local upgrade = ReplicatedStorage:FindFirstChild("Upgrade{stat}")

upgrade.OnServerEvent:Connect(function(player)
    if player.{stat} >= {price} then
        Leaderstats:Add(player, "{stat}", -{price})
        player.Multiplier = player.Multiplier * 2
        upgrade:FireClient(player, {price * 2})
    end
end)
''',
    )


def curriculum_records(rounds: int) -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    for index in range(rounds):
        records.extend(luau_curriculum(index))
        records.extend(cpp_curriculum(index))
        records.extend(csharp_curriculum(index))
        records.extend(completion_curriculum(index))
        records.extend(advanced_curriculum(index, sample))
    return records
