local hazard = script.Parent

hazard.Touched:Connect(function(hit)
    if hit.Health > 0 then
        
