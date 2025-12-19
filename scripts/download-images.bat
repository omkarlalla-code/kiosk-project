@echo off
cd "C:\Users\Omkar\OneDrive\Desktop\Chatbot\public\images\greek"

echo Downloading Greek civilization images...

curl -L -o "erechtheion.jpg" "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Erechtheion_Athens.jpg/1280px-Erechtheion_Athens.jpg"
echo Downloaded erechtheion.jpg
ping localhost -n 2 >nul

curl -L -o "theater_epidaurus.jpg" "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Theatre_of_Epidaurus.jpg/1280px-Theatre_of_Epidaurus.jpg"
echo Downloaded theater_epidaurus.jpg
ping localhost -n 2 >nul

curl -L -o "ancient_agora.jpg" "https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Ancient_Agora_of_Athens_2019.jpg/1280px-Ancient_Agora_of_Athens_2019.jpg"
echo Downloaded ancient_agora.jpg
ping localhost -n 2 >nul

curl -L -o "temple_of_poseidon.jpg" "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Cape_Sounion.jpg/1280px-Cape_Sounion.jpg"
echo Downloaded temple_of_poseidon.jpg
ping localhost -n 2 >nul

curl -L -o "theater_of_dionysus.jpg" "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Theatre_of_Dionysus_01.jpg/1280px-Theatre_of_Dionysus_01.jpg"
echo Downloaded theater_of_dionysus.jpg
ping localhost -n 2 >nul

curl -L -o "temple_of_apollo_delphi.jpg" "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Delphi_temple_of_Apollo.jpg/1280px-Delphi_temple_of_Apollo.jpg"
echo Downloaded temple_of_apollo_delphi.jpg
ping localhost -n 2 >nul

curl -L -o "temple_of_hephaestus.jpg" "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Temple_of_Hephaestus_in_Athens.jpg/1280px-Temple_of_Hephaestus_in_Athens.jpg"
echo Downloaded temple_of_hephaestus.jpg
ping localhost -n 2 >nul

curl -L -o "stoa_of_attalos.jpg" "https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Stoa_of_Attalos_%%28reconstruction%%29.jpg/1280px-Stoa_of_Attalos_%%28reconstruction%%29.jpg"
echo Downloaded stoa_of_attalos.jpg
ping localhost -n 2 >nul

curl -L -o "theater_delphi.jpg" "https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Delphi_-_The_theatre.jpg/1280px-Delphi_-_The_theatre.jpg"
echo Downloaded theater_delphi.jpg

echo.
echo Download complete!
dir *.jpg
