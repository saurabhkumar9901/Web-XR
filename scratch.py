import re

def fix():
    path = "d:/ai assitant 2/ai assistant/bot.py"
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # The regex matches: if 'guidance_processor' in locals():
    # followed by indentation and guidance_processor.is_meditating = True/False
    new_content = re.sub(
        r"if ['\"]guidance_processor['\"] in locals\(\):\s+(guidance_processor\.is_meditating = (True|False))",
        r"try:\n            \1\n        except NameError:\n            pass",
        content
    )

    if content != new_content:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("Replaced successfully!")
    else:
        print("No matches found.")

if __name__ == "__main__":
    fix()
