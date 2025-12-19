#!/bin/bash
cd "C:\Users\Omkar\OneDrive\Desktop\Chatbot\public\images\greek"

echo "Downloading key Greek civilization images..."

# Architecture - Temples
curl -L -o "temple_of_hephaestus.jpg" "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Temple_of_Hephaestus_in_Athens.jpg/1280px-Temple_of_Hephaestus_in_Athens.jpg" && echo "✓ Temple of Hephaestus" && sleep 1
curl -L -o "temple_of_poseidon.jpg" "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Cape_Sounion.jpg/1280px-Cape_Sounion.jpg" && echo "✓ Temple of Poseidon" && sleep 1
curl -L -o "erechtheion.jpg" "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Erechtheion_Athens.jpg/1280px-Erechtheion_Athens.jpg" && echo "✓ Erechtheion" && sleep 1
curl -L -o "temple_of_apollo_delphi.jpg" "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Delphi_temple_of_Apollo.jpg/1280px-Delphi_temple_of_Apollo.jpg" && echo "✓ Temple of Apollo" && sleep 1
curl -L -o "temple_of_athena_nike.jpg" "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Athena_Nike_temple%2C_Acropolis%2C_Athens%2C_Greece_-_panoramio.jpg/1280px-Athena_Nike_temple%2C_Acropolis%2C_Athens%2C_Greece_-_panoramio.jpg" && echo "✓ Temple of Athena Nike" && sleep 1

# Architecture - Theaters
curl -L -o "theater_epidaurus.jpg" "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Theatre_of_Epidaurus.jpg/1280px-Theatre_of_Epidaurus.jpg" && echo "✓ Theater of Epidaurus" && sleep 1
curl -L -o "theater_of_dionysus.jpg" "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Theatre_of_Dionysus_01.jpg/1280px-Theatre_of_Dionysus_01.jpg" && echo "✓ Theater of Dionysus" && sleep 1
curl -L -o "theater_delphi.jpg" "https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Delphi_-_The_theatre.jpg/1280px-Delphi_-_The_theatre.jpg" && echo "✓ Theater at Delphi" && sleep 1

# Architecture - Public
curl -L -o "ancient_agora.jpg" "https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Ancient_Agora_of_Athens_2019.jpg/1280px-Ancient_Agora_of_Athens_2019.jpg" && echo "✓ Ancient Agora" && sleep 1
curl -L -o "stoa_of_attalos.jpg" "https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Stoa_of_Attalos_%28reconstruction%29.jpg/1280px-Stoa_of_Attalos_%28reconstruction%29.jpg" && echo "✓ Stoa of Attalos" && sleep 1

echo ""
echo "Download complete! Downloaded 10 key images."
ls -lh *.jpg | wc -l
echo "Total images in directory:"
ls -lh *.jpg
