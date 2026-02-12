start "google" "c:\program files\Google\Chrome\Application\chrome.exe" --incognito --profile-directory="Default" --new-window "localhost:8000"
py -m http.server 8000
