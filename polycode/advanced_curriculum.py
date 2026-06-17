from __future__ import annotations

from collections.abc import Callable, Iterable


SampleFactory = Callable[[str, str, str], dict[str, str]]

STATS = ("Coins", "Lava", "Wins", "Points", "Gems", "Score")
REMOTES = ("Purchase", "Reward", "Upgrade", "Roll", "Damage", "Round")
PARTS = ("Door", "Hazard", "RewardPad", "LaunchPad", "Finish", "Spinner")
SOUNDS = ("PurchaseSound", "Success", "Denied", "RoundStart", "RewardSound")


def luau_advanced(index: int, sample: SampleFactory) -> Iterable[dict[str, str]]:
    stat = STATS[index % len(STATS)]
    second_stat = STATS[(index + 3) % len(STATS)]
    remote = REMOTES[index % len(REMOTES)]
    part = PARTS[index % len(PARTS)]
    sound = SOUNDS[index % len(SOUNDS)]
    price = 25 + (index * 17) % 450
    reward = 2 + (index * 11) % 80
    multiplier = 2 + index % 5
    damage = 10 + (index * 7) % 70
    rounds = 3 + index % 8
    cooldown = 0.5 + (index % 6) * 0.25

    yield sample(
        "luau",
        "advanced-secure-purchase",
        f'''
local purchase = ReplicatedStorage:FindFirstChild("{remote}{stat}")

purchase.OnServerEvent:Connect(function(player, requestedAmount)
    if requestedAmount > 0 then
        local totalPrice = {price} * requestedAmount
        if player.{stat} >= totalPrice then
            Leaderstats:Add(player, "{stat}", -totalPrice)
            player.Multiplier = player.Multiplier + requestedAmount
            purchase:FireClient(player, true, totalPrice)
        else
            purchase:FireClient(player, false, totalPrice)
        end
    end
end)
''',
    )
    yield sample(
        "luau",
        "advanced-touch-cooldown",
        f'''
local hazard = script.Parent
hazard:SetAttribute("Busy", false)

hazard.Touched:Connect(function(hit)
    local player = hit.Parent
    if hazard:GetAttribute("Busy") == false then
        if player.Health > 0 then
            hazard:SetAttribute("Busy", true)
            player.Health = player.Health - {damage}
            task.wait({cooldown:.2f})
            hazard:SetAttribute("Busy", false)
        end
    end
end)
''',
    )
    yield sample(
        "luau",
        "advanced-round-loop",
        f'''
local roundRemote = ReplicatedStorage:FindFirstChild("{remote}Round")
local roundNumber = 1

while roundNumber <= {rounds} do
    roundRemote:FireAllClients(roundNumber, "Starting")
    task.wait(1)
    roundRemote:FireAllClients(roundNumber, "Playing")
    task.wait(3)
    roundRemote:FireAllClients(roundNumber, "Finished")
    roundNumber = roundNumber + 1
end
''',
    )
    yield sample(
        "luau",
        "advanced-datastore-profile",
        f'''
local store = DataStoreService:GetDataStore("{stat}Profile")
local save = ReplicatedStorage:FindFirstChild("Save{stat}")
local load = ReplicatedStorage:FindFirstChild("Load{stat}")

load.OnServerInvoke = function(player)
    local key = player.UserId
    local savedValue = store:GetAsync(key)
    if savedValue == nil then
        savedValue = {reward}
        store:SetAsync(key, savedValue)
    end
    return savedValue
end

save.OnServerEvent:Connect(function(player, value)
    if value >= 0 then
        store:SetAsync(player.UserId, value)
    end
end)
''',
    )
    yield sample(
        "luau",
        "advanced-weighted-rng",
        f'''
local roll = ReplicatedStorage:FindFirstChild("{remote}{stat}")

roll.OnServerInvoke = function(player)
    local rng = Random.new(player.UserId + {1000 + index * 31})
    local chance = rng:NextNumber(0, 1)
    if chance < 0.05 then
        Leaderstats:Add(player, "{stat}", {reward * 10})
        return "Legendary"
    elseif chance < 0.25 then
        Leaderstats:Add(player, "{stat}", {reward * 3})
        return "Rare"
    else
        Leaderstats:Add(player, "{second_stat}", {reward})
        return "Common"
    end
end
''',
    )
    yield sample(
        "luau",
        "advanced-gui-state",
        f'''
local button = script.Parent
local panel = button.Parent.ShopPanel
local status = panel.Status
local purchase = ReplicatedStorage:FindFirstChild("{remote}{stat}")

button.Activated:Connect(function()
    button.Text = "Buying..."
    purchase:FireServer(1)
end)

purchase.OnClientEvent:Connect(function(success, totalPrice)
    if success then
        status.Text = "Purchased for " + totalPrice
        panel.Visible = false
    else
        status.Text = "You need " + totalPrice + " {stat.lower()}"
    end
    button.Text = "Buy"
end)
''',
    )
    yield sample(
        "luau",
        "advanced-tween-sequence",
        f'''
local target = Workspace:FindFirstChild("{part}")
local openTween = TweenService:Create(target, TweenInfo.new(0.6, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {{
    Position = Vector3.new(0, {6 + index % 9}, 0),
    Transparency = 0.35
}})
local closeTween = TweenService:Create(target, TweenInfo.new(0.4, Enum.EasingStyle.Quad, Enum.EasingDirection.In), {{
    Position = Vector3.new(0, 2, 0),
    Transparency = 0
}})

openTween:Play()
task.wait(1.5)
closeTween:Play()
''',
    )
    yield sample(
        "luau",
        "advanced-module-config",
        f'''
local Config = {{}}
Config.BaseReward = {reward}
Config.Multiplier = {multiplier}
Config.Price = {price}
Config.Enabled = true

return Config
''',
    )
    yield sample(
        "luau",
        "advanced-input-toggle",
        f'''
local player = Players.LocalPlayer
local enabled = true
local sound = Workspace:FindFirstChild("{sound}")

UserInputService.InputBegan:Connect(function(input)
    if input.KeyCode == Enum.KeyCode.F then
        if enabled then
            player.SprintEnabled = false
            sound:Stop()
            enabled = false
        else
            player.SprintEnabled = true
            sound:Play()
            enabled = true
        end
    end
end)
''',
    )
    yield sample(
        "luau",
        "advanced-reward-chain",
        f'''
local rewardRemote = ReplicatedStorage:FindFirstChild("{remote}{stat}")

rewardRemote.OnServerEvent:Connect(function(player, combo)
    if combo >= 1 then
        local baseReward = {reward} * combo
        if combo >= 10 then
            baseReward = baseReward * {multiplier}
            Leaderstats:Add(player, "{second_stat}", 1)
        elseif combo >= 5 then
            baseReward = baseReward + {price}
        end
        Leaderstats:Add(player, "{stat}", baseReward)
        rewardRemote:FireClient(player, baseReward)
    end
end)
''',
    )


def cpp_advanced(index: int, sample: SampleFactory) -> Iterable[dict[str, str]]:
    stat = STATS[index % len(STATS)]
    second_stat = STATS[(index + 3) % len(STATS)]
    remote = REMOTES[index % len(REMOTES)]
    part = PARTS[index % len(PARTS)]
    sound = SOUNDS[index % len(SOUNDS)]
    price = 25 + (index * 17) % 450
    reward = 2 + (index * 11) % 80
    multiplier = 2 + index % 5
    damage = 10 + (index * 7) % 70
    rounds = 3 + index % 8

    yield sample(
        "cpp",
        "advanced-secure-purchase",
        f'''
#include <poly/server.hpp>
auto purchase = ReplicatedStorage.Find("{remote}{stat}");

purchase.OnServerEvent.Connect([&](auto player, auto requestedAmount) {{
    if (requestedAmount > 0) {{
        auto totalPrice = {price} * requestedAmount;
        if (player.{stat} >= totalPrice) {{
            Leaderstats::Add(player, "{stat}", -totalPrice);
            player.Multiplier = player.Multiplier + requestedAmount;
            purchase.FireClient(player, true, totalPrice);
        }} else {{
            purchase.FireClient(player, false, totalPrice);
        }}
    }}
}});
''',
    )
    yield sample(
        "cpp",
        "advanced-touch-cooldown",
        f'''
auto hazard = Script.Parent;
hazard.SetAttribute("Busy", false);

hazard.Touched.Connect([&](auto hit) {{
    auto player = hit.Parent;
    if (hazard.GetAttribute("Busy") == false) {{
        if (player.Health > 0) {{
            hazard.SetAttribute("Busy", true);
            player.Health = player.Health - {damage};
            wait(0.75);
            hazard.SetAttribute("Busy", false);
        }}
    }}
}});
''',
    )
    yield sample(
        "cpp",
        "advanced-round-loop",
        f'''
auto roundRemote = ReplicatedStorage.Find("{remote}Round");
auto roundNumber = 1;

while (roundNumber <= {rounds}) {{
    roundRemote.FireAllClients(roundNumber, "Starting");
    wait(1);
    roundRemote.FireAllClients(roundNumber, "Playing");
    wait(3);
    roundRemote.FireAllClients(roundNumber, "Finished");
    roundNumber = roundNumber + 1;
}}
''',
    )
    yield sample(
        "cpp",
        "advanced-remote-function",
        f'''
auto rewardFunction = ReplicatedStorage.Find("{remote}{stat}");

rewardFunction.OnServerInvoke = [&](auto player, auto combo) {{
    auto result = {reward} * combo;
    if (combo >= 10) {{
        result = result * {multiplier};
        Leaderstats::Add(player, "{second_stat}", 1);
    }} else if (combo >= 5) {{
        result = result + {price};
    }}
    Leaderstats::Add(player, "{stat}", result);
    return result;
}};
''',
    )
    yield sample(
        "cpp",
        "advanced-gui-state",
        f'''
#include <poly/client.hpp>
auto button = Script.Parent;
auto panel = button.Parent.ShopPanel;
auto status = panel.Status;
auto purchase = ReplicatedStorage.Find("{remote}{stat}");

button.Activated.Connect([&]() {{
    button.Text = "Buying...";
    purchase.FireServer(1);
}});

purchase.OnClientEvent.Connect([&](auto success, auto totalPrice) {{
    if (success) {{
        status.Text = "Purchased";
        panel.Visible = false;
    }} else {{
        status.Text = "Not enough {stat}";
    }}
    button.Text = "Buy";
}});
''',
    )
    yield sample(
        "cpp",
        "advanced-tween-sequence",
        f'''
auto target = Workspace.Find("{part}");
auto openTween = TweenService::Create(
    target,
    TweenInfo(0.6, EasingStyle::Quad, EasingDirection::Out),
    {{ Position = Vector3(0, {6 + index % 9}, 0), Transparency = 0.35 }}
);
auto closeTween = TweenService::Create(
    target,
    TweenInfo(0.4, EasingStyle::Quad, EasingDirection::In),
    {{ Position = Vector3(0, 2, 0), Transparency = 0 }}
);
openTween.Play();
wait(1.5);
closeTween.Play();
''',
    )
    yield sample(
        "cpp",
        "advanced-input-toggle",
        f'''
auto player = Players::LocalPlayer;
auto sound = Workspace.Find("{sound}");
auto enabled = true;

UserInputService.InputBegan.Connect([&](auto input) {{
    if (input.KeyCode == KeyCode::F) {{
        if (enabled) {{
            player.SprintEnabled = false;
            sound.Stop();
            enabled = false;
        }} else {{
            player.SprintEnabled = true;
            sound.Play();
            enabled = true;
        }}
    }}
}});
''',
    )
    yield sample(
        "cpp",
        "advanced-datastore",
        f'''
auto store = DataStoreService::GetDataStore("{stat}Profile");
auto load = ReplicatedStorage.Find("Load{stat}");

load.OnServerInvoke = [&](auto player) {{
    auto value = store.GetAsync(player.UserId);
    if (value == nullptr) {{
        value = {reward};
        store.SetAsync(player.UserId, value);
    }}
    return value;
}};
''',
    )


def csharp_advanced(index: int, sample: SampleFactory) -> Iterable[dict[str, str]]:
    stat = STATS[index % len(STATS)]
    second_stat = STATS[(index + 3) % len(STATS)]
    remote = REMOTES[index % len(REMOTES)]
    part = PARTS[index % len(PARTS)]
    sound = SOUNDS[index % len(SOUNDS)]
    price = 25 + (index * 17) % 450
    reward = 2 + (index * 11) % 80
    multiplier = 2 + index % 5
    damage = 10 + (index * 7) % 70
    rounds = 3 + index % 8

    yield sample(
        "csharp",
        "advanced-secure-purchase",
        f'''
using Poly;
var purchase = ReplicatedStorage.Find("{remote}{stat}");

purchase.OnServerEvent += (player, requestedAmount) => {{
    if (requestedAmount > 0) {{
        var totalPrice = {price} * requestedAmount;
        if (player.{stat} >= totalPrice) {{
            Leaderstats.Add(player, "{stat}", -totalPrice);
            player.Multiplier = player.Multiplier + requestedAmount;
            purchase.FireClient(player, true, totalPrice);
        }} else {{
            purchase.FireClient(player, false, totalPrice);
        }}
    }}
}};
''',
    )
    yield sample(
        "csharp",
        "advanced-touch-cooldown",
        f'''
var hazard = Script.Parent;
hazard.SetAttribute("Busy", false);

hazard.Touched += (hit) => {{
    var player = hit.Parent;
    if (hazard.GetAttribute("Busy") == false) {{
        if (player.Health > 0) {{
            hazard.SetAttribute("Busy", true);
            player.Health = player.Health - {damage};
            Wait(0.75);
            hazard.SetAttribute("Busy", false);
        }}
    }}
}};
''',
    )
    yield sample(
        "csharp",
        "advanced-round-loop",
        f'''
var roundRemote = ReplicatedStorage.Find("{remote}Round");
var roundNumber = 1;

while (roundNumber <= {rounds}) {{
    roundRemote.FireAllClients(roundNumber, "Starting");
    Wait(1);
    roundRemote.FireAllClients(roundNumber, "Playing");
    Wait(3);
    roundRemote.FireAllClients(roundNumber, "Finished");
    roundNumber = roundNumber + 1;
}}
''',
    )
    yield sample(
        "csharp",
        "advanced-remote-function",
        f'''
var rewardFunction = ReplicatedStorage.Find("{remote}{stat}");

rewardFunction.OnServerInvoke = (player, combo) => {{
    var result = {reward} * combo;
    if (combo >= 10) {{
        result = result * {multiplier};
        Leaderstats.Add(player, "{second_stat}", 1);
    }} else if (combo >= 5) {{
        result = result + {price};
    }}
    Leaderstats.Add(player, "{stat}", result);
    return result;
}};
''',
    )
    yield sample(
        "csharp",
        "advanced-gui-state",
        f'''
using Poly;
var button = Script.Parent;
var panel = button.Parent.ShopPanel;
var status = panel.Status;
var purchase = ReplicatedStorage.Find("{remote}{stat}");

button.Activated += () => {{
    button.Text = "Buying...";
    purchase.FireServer(1);
}};

purchase.OnClientEvent += (success, totalPrice) => {{
    if (success) {{
        status.Text = "Purchased";
        panel.Visible = false;
    }} else {{
        status.Text = "Not enough {stat}";
    }}
    button.Text = "Buy";
}};
''',
    )
    yield sample(
        "csharp",
        "advanced-tween-sequence",
        f'''
var target = Workspace.Find("{part}");
var openTween = TweenService.Create(
    target,
    new TweenInfo(0.6, EasingStyle.Quad, EasingDirection.Out),
    new {{ Position = new Vector3(0, {6 + index % 9}, 0), Transparency = 0.35 }}
);
var closeTween = TweenService.Create(
    target,
    new TweenInfo(0.4, EasingStyle.Quad, EasingDirection.In),
    new {{ Position = new Vector3(0, 2, 0), Transparency = 0 }}
);
openTween.Play();
Wait(1.5);
closeTween.Play();
''',
    )
    yield sample(
        "csharp",
        "advanced-input-toggle",
        f'''
var player = Players.LocalPlayer;
var sound = Workspace.Find("{sound}");
var enabled = true;

UserInputService.InputBegan += (input) => {{
    if (input.KeyCode == KeyCode.F) {{
        if (enabled) {{
            player.SprintEnabled = false;
            sound.Stop();
            enabled = false;
        }} else {{
            player.SprintEnabled = true;
            sound.Play();
            enabled = true;
        }}
    }}
}};
''',
    )
    yield sample(
        "csharp",
        "advanced-datastore",
        f'''
var store = DataStoreService.GetDataStore("{stat}Profile");
var load = ReplicatedStorage.Find("Load{stat}");

load.OnServerInvoke = (player) => {{
    var value = store.GetAsync(player.UserId);
    if (value == null) {{
        value = {reward};
        store.SetAsync(player.UserId, value);
    }}
    return value;
}};
''',
    )


def advanced_curriculum(
    index: int, sample: SampleFactory
) -> list[dict[str, str]]:
    return [
        *luau_advanced(index, sample),
        *cpp_advanced(index, sample),
        *csharp_advanced(index, sample),
    ]
