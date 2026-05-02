Start-Process -FilePath "powershell" -ArgumentList "-NoLogo","-NoProfile","-Command","Set-Location 'E:\Vibe coding\AI All in one\api'; npm run dev"
Start-Sleep -Seconds 2
Start-Process -FilePath "powershell" -ArgumentList "-NoLogo","-NoProfile","-Command","Set-Location 'E:\Vibe coding\AI All in one\frontend'; npm run dev -- --host 127.0.0.1 --port 4173"
Start-Sleep -Seconds 2
Start-Process -FilePath "powershell" -ArgumentList "-NoLogo","-NoProfile","-Command","Set-Location 'E:\Vibe coding\AI All in one\admin'; npm run dev -- --host 127.0.0.1 --port 4174"
