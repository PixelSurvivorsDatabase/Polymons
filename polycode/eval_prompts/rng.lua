local roll = ReplicatedStorage:FindFirstChild("RollGems")

roll.OnServerEvent:Connect(function(player)
    local reward = math.random(1, 10)
    
