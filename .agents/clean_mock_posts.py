with open('index.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

start_idx = -1
for i, line in enumerate(lines):
    if 'const mockPosts = [' in line:
        start_idx = i
        break

end_idx = -1
if start_idx != -1:
    for i in range(start_idx, len(lines)):
        if lines[i].strip() == '];':
            end_idx = i
            break

if start_idx != -1 and end_idx != -1:
    print(f"Removing mockPosts from index {start_idx} to {end_idx}")
    lines[start_idx:end_idx+1] = ["  const mockPosts = [];\n"]

loader_start = -1
for i, line in enumerate(lines):
    if '// Load community posts from localStorage or fallback to mockPosts' in line:
        loader_start = i
        break

loader_end = -1
if loader_start != -1:
    for i in range(loader_start, len(lines)):
        if '  // App state' in lines[i]:
            loader_end = i
            break

if loader_start != -1 and loader_end != -1:
    print(f"Updating initialPosts loader from index {loader_start} to {loader_end}")
    new_loader = [
        "  // Load community posts from localStorage or fallback to empty\n",
        "  let initialPosts = [];\n",
        "  try {\n",
        "    const savedPosts = localStorage.getItem('taekwondo_community_posts');\n",
        "    if (savedPosts) {\n",
        "      const parsed = JSON.parse(savedPosts);\n",
        "      if (parsed && parsed.length > 0 && !parsed.some(p => p.id && String(p.id).startsWith('post-'))) {\n",
        "        initialPosts = parsed;\n",
        "      }\n",
        "    }\n",
        "  } catch (e) {\n",
        "    console.warn('Failed to load community posts from localStorage', e);\n",
        "  }\n\n"
    ]
    lines[loader_start:loader_end] = new_loader

with open('index.js', 'w', encoding='utf-8') as f:
    f.writelines(lines)
print("Done!")
