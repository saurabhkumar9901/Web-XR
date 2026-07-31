import re

with open('d:/ai assitant 2/ai assistant/client/vr-init.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Update Timer Panel
content = re.sub(
    r"bg:\s*'rgba\(8,\s*14,\s*22,\s*0\.18\)',\s*bg2:\s*'rgba\(6,\s*10,\s*16,\s*0\.18\)',\s*border:\s*'rgba\(188,\s*255,\s*204,\s*0\.2\)',",
    "bg: 'rgba(0, 0, 0, 0)', bg2: 'rgba(0, 0, 0, 0)',\n    border: 'rgba(0, 0, 0, 0)',",
    content
)
content = re.sub(
    r'vrState\.timerPanel\.position\.set\(0\.0,\s*0\.45,\s*-1\.8\);',
    r'vrState.timerPanel.position.set(0.7, 0.45, -1.8);',
    content
)

with open('d:/ai assitant 2/ai assistant/client/vr-init.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')
