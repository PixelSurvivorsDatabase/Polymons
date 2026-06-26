from __future__ import annotations

from textwrap import dedent


def chat_record(topic: str, user: str, assistant: str) -> dict[str, str]:
    return {
        "language": "luau",
        "topic": topic,
        "text": dedent(
            f"""
            <|chat|>
            User: {user.strip()}
            PolyCode: {assistant.strip()}
            <|endchat|>
            """
        ).strip(),
    }


def chat_curriculum(rounds: int = 16) -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    stat_names = ["Coins", "Lava", "Wins", "Points"]
    remote_names = ["ClickRemote", "UpgradeRemote", "ShopRemote", "DamageRemote"]
    button_names = ["ClickButton", "UpgradeButton", "ShopButton", "BuyButton"]

    for index in range(rounds):
        stat = stat_names[index % len(stat_names)]
        remote = remote_names[index % len(remote_names)]
        button = button_names[index % len(button_names)]
        price = 10 + index * 5
        reward = 1 + (index % 4)

        records.extend(
            [
                chat_record(
                    "leaderstats_button",
                    f"How do I make a button give the player +{reward} {stat}?",
                    f"""Use a LocalScript in the TextButton to fire a RemoteEvent, then let a server Script edit Leaderstats.

LocalScript:
```luau
local button = script.Parent
local remote = ReplicatedStorage.{remote}

button.Activated:Connect(function()
    remote:FireServer()
end)
```

Server Script:
```luau
local remote = ReplicatedStorage.{remote}

remote.OnServerEvent:Connect(function(player)
    Leaderstats:Add(player, "{stat}", {reward})
end)
```

Keep the actual stat change on the server so exploiters cannot give themselves free values.""",
                ),
                chat_record(
                    "upgrade_price",
                    f"Make an upgrade that costs {price} {stat} and doubles Multiplier.",
                    f"""Store the price and multiplier on the player, then check the price on the server.

```luau
local upgrade = ReplicatedStorage.{remote}

upgrade.OnServerEvent:Connect(function(player)
    if player.{stat} >= player.UpgradePrice then
        Leaderstats:Subtract(player, "{stat}", player.UpgradePrice)
        player.Multiplier = player.Multiplier * 2
        player.UpgradePrice = math.floor(player.UpgradePrice * 1.85)
        upgrade:FireClient(player, player.UpgradePrice)
    end
end)
```

The client can listen with `OnClientEvent` and update the button text.""",
                ),
                chat_record(
                    "gui_open",
                    f"Why does my shop GUI not open when I press {button}?",
                    f"""First check capitalization. In Polymons, GUI visibility is `Visible`, not `visible`.

```luau
local button = script.Parent
local shop = button.Parent.ShopGui

button.Activated:Connect(function()
    shop.Visible = true
    print("Shop opened")
end)
```

Also make sure the LocalScript is inside the button or inside a GUI object under StarterGui.""",
                ),
                chat_record(
                    "touch_damage",
                    "How do I make touching a part hurt the player?",
                    """Put a normal Script under the damage part and use `Touched`. The `hit` value is usually a body part, so get the player from the character.

```luau
script.Parent.Touched:Connect(function(hit)
    local character = hit.Parent
    local player = Players:GetPlayerFromCharacter(character)
    if player then
        player.Character.Humanoid.Health = player.Character.Humanoid.Health - 10
    end
end)
```

If it damages too fast, add a debounce or cooldown.""",
                ),
                chat_record(
                    "remote_function",
                    "When should I use RemoteFunction instead of RemoteEvent?",
                    """Use a RemoteEvent when you want to send a signal and continue immediately. Use a RemoteFunction when the caller needs a returned value.

Example:
```luau
local price = ReplicatedStorage.GetUpgradePrice:InvokeServer()
button.Text = "Upgrade - " + price + " lava"
```

On the server:
```luau
ReplicatedStorage.GetUpgradePrice.OnServerInvoke = function(player)
    return player.UpgradePrice
end
```""",
                ),
                chat_record(
                    "random_rng",
                    "How do I make a random reward?",
                    f"""Use `math.random` on the server so the result is trusted.

```luau
local roll = math.random(1, 100)

if roll <= 5 then
    Leaderstats:Add(player, "{stat}", 100)
elseif roll <= 25 then
    Leaderstats:Add(player, "{stat}", 25)
else
    Leaderstats:Add(player, "{stat}", 5)
end
```

Put rarer rewards first so the conditions stay easy to read.""",
                ),
            ]
        )

    records.extend(
        [
            chat_record(
                "explain_if",
                "Can I use if statements and elseif?",
                """Yes. Use `if`, `elseif`, and `else`, then close the block with `end`.

```luau
if player.Lava >= 100 then
    print("rich")
elseif player.Lava >= 30 then
    print("can upgrade")
else
    print("keep clicking")
end
```""",
            ),
            chat_record(
                "fix_fire_server",
                "What is wrong with upgrade:fireserver?",
                """Use the exact method name and capitalization: `FireServer()`.

```luau
upgrade:FireServer()
```

Method names are case-sensitive. `fireserver` will not call the RemoteEvent method.""",
            ),
            chat_record(
                "sound_play",
                "How do I play a sound named blank when pressing F?",
                """Put a LocalScript in StarterPlayerScripts and find the sound in Workspace.

```luau
local sound = Workspace.blank

UserInputService.InputBegan:Connect(function(input)
    if input.KeyCode == Enum.KeyCode.F then
        sound:Play()
    end
end)
```

If the sound should be heard by everyone, fire a RemoteEvent and play it from a server Script.""",
            ),
            chat_record(
                "security",
                "Should the client directly add leaderstats?",
                """No. The client should request an action with `FireServer`, and the server should decide if it is allowed.

Bad:
```luau
Leaderstats:Add(player, "Coins", 999999)
```

Better:
```luau
ClickRemote:FireServer()
```

Then the server adds the correct amount.""",
            ),
        ]
    )
    return records
