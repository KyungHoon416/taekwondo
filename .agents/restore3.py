import json
import os

log_path = '/Users/kimkyunghoon/.gemini/antigravity/brain/861a419b-e2e2-44ac-af1c-2f815d8a8012/.system_generated/logs/transcript_full.jsonl'
index_js_path = '/Users/kimkyunghoon/Desktop/수익화/taekwondo/index.js'

print(f"Reading index.js from: {index_js_path}")
with open(index_js_path, 'r', encoding='utf-8') as f:
    content = f.read()

replacements = {}
target_steps = [443, 641, 649, 659, 683, 705]

with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            step = json.loads(line)
            step_idx = step.get('step_index')
            if step_idx in target_steps:
                for tc in step.get('tool_calls', []):
                    args = tc.get('arguments', tc.get('args', {}))
                    if isinstance(args, str):
                        args = json.loads(args)
                    target_file = args.get('TargetFile', '')
                    if 'index.js' in target_file:
                        target = args.get('TargetContent')
                        replacement = args.get('ReplacementContent')
                        if target and replacement:
                            replacements[step_idx] = (target, replacement)
        except Exception as e:
            pass

# Apply in precise sequence
for step_idx in target_steps:
    if step_idx in replacements:
        target, replacement = replacements[step_idx]
        print(f"Applying Step {step_idx}...")
        if target in content:
            content = content.replace(target, replacement)
            print(f"-> Successfully restored Step {step_idx}!")
        else:
            # Try with carriage return normalization
            target_norm = target.replace('\r\n', '\n').strip()
            content_norm = content.replace('\r\n', '\n')
            if target_norm in content_norm:
                content = content_norm.replace(target_norm, replacement)
                print(f"-> Successfully restored Step {step_idx} after normalization!")
            else:
                print(f"-> Could not restore Step {step_idx}!")

with open(index_js_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Done!")
