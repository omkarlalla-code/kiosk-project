$images = @(
    @{id='parthenon_front'; url='https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/The_Parthenon_in_Athens.jpg/1280px-The_Parthenon_in_Athens.jpg'},
    @{id='temple_of_zeus'; url='https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Temple_of_Olympian_Zeus%2C_Athens_-_20070829-02.jpg/1280px-Temple_of_Olympian_Zeus%2C_Athens_-_20070829-02.jpg'},
    @{id='erechtheion'; url='https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Erechtheion_Athens.jpg/1280px-Erechtheion_Athens.jpg'},
    @{id='theater_epidaurus'; url='https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Theatre_of_Epidaurus.jpg/1280px-Theatre_of_Epidaurus.jpg'},
    @{id='ancient_agora'; url='https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Ancient_Agora_of_Athens_2019.jpg/1280px-Ancient_Agora_of_Athens_2019.jpg'},
    @{id='temple_of_poseidon'; url='https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Cape_Sounion.jpg/1280px-Cape_Sounion.jpg'},
    @{id='theater_of_dionysus'; url='https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Theatre_of_Dionysus_01.jpg/1280px-Theatre_of_Dionysus_01.jpg'},
    @{id='temple_of_apollo_delphi'; url='https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Delphi_temple_of_Apollo.jpg/1280px-Delphi_temple_of_Apollo.jpg'},
    @{id='temple_of_hephaestus'; url='https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Temple_of_Hephaestus_in_Athens.jpg/1280px-Temple_of_Hephaestus_in_Athens.jpg'},
    @{id='stoa_of_attalos'; url='https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Stoa_of_Attalos_%28reconstruction%29.jpg/1280px-Stoa_of_Attalos_%28reconstruction%29.jpg'}
)

$outputDir = 'C:\Users\Omkar\OneDrive\Desktop\Chatbot\public\images\greek'

Write-Host ('Downloading ' + $images.Count + ' images...')

foreach ($img in $images) {
    $outputPath = Join-Path $outputDir ($img.id + '.jpg')
    Write-Host ('Downloading ' + $img.id + '...')

    try {
        Invoke-WebRequest -Uri $img.url -OutFile $outputPath -UseBasicParsing
        Write-Host ('  Downloaded: ' + $img.id + '.jpg')
    } catch {
        Write-Host ('  Failed: ' + $img.id)
    }
}

Write-Host ''
Write-Host 'Download complete!'
Write-Host ('Images saved to: ' + $outputDir)
