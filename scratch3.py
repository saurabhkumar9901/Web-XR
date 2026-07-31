import re

# 1. Update index.html
with open('d:/ai assitant 2/ai assistant/client/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Hide the recommended section title and grid
html = re.sub(
    r'<div class="menu-section-title">Recommended by Aura</div>\s*<div id="recommended-grid" class="environment-grid"></div>',
    r'<!-- Recommended grid removed -->',
    html
)
html = html.replace('<div class="menu-section-title">All Environments</div>', '<!-- All Environments title removed -->')

with open('d:/ai assitant 2/ai assistant/client/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

# 2. Update script.js
with open('d:/ai assitant 2/ai assistant/client/script.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Remove the loop that populates recommendedGrid
js = re.sub(
    r'recommended\.forEach\(\(env, i\) => \{\s*recommendedGrid\.appendChild\(createEnvironmentCard\(env, \{ \.\.\.data, top_sub_type: topSubType \}, true, i\)\);\s*\}\);',
    r'// Recommended grid population removed',
    js
)

with open('d:/ai assitant 2/ai assistant/client/script.js', 'w', encoding='utf-8') as f:
    f.write(js)

# 3. Update vr-init.js
with open('d:/ai assitant 2/ai assistant/client/vr-init.js', 'r', encoding='utf-8') as f:
    vrjs = f.read()

vrjs = re.sub(
    r'// ---- Section label: Recommended ----[\s\S]*?vrState\.menuGroup\.add\(recLabel\);',
    r'// Recommended label removed',
    vrjs
)

vrjs = re.sub(
    r'if \(!vrState\.showAllEnvs\) \{[\s\S]*?displayEnvs = envs\.slice\(0, 3\); // Fallback\s*\}',
    r'// Always show all envs (removed if !vrState.showAllEnvs block)',
    vrjs
)

# Fix the arc width in VR for all environments
vrjs = vrjs.replace(
    r'const arcSpan = vrState.showAllEnvs ? Math.PI * 1.1 : Math.PI * 0.55;',
    r'const arcSpan = Math.PI * 1.1;'
)
vrjs = vrjs.replace(
    r'const radius = vrState.showAllEnvs ? 3.4 : 3.0;',
    r'const radius = 3.4;'
)

with open('d:/ai assitant 2/ai assistant/client/vr-init.js', 'w', encoding='utf-8') as f:
    f.write(vrjs)

print("UI updated to show all environments!")
