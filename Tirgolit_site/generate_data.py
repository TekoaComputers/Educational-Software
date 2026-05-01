#!/usr/bin/env python3
"""Convert .unt files and Rama*.txt index files to JS data module."""
import os, json, re

SRC = '/home/levlavy/Documents/Tekoa_Computers/Code/Tirgolit/Units'
OUT = '/home/levlavy/Documents/Tekoa_Computers/Code/Tirgolit_site/js/data.js'

def read_cp1255(path):
    with open(path, 'rb') as f:
        return f.read().decode('cp1255', errors='replace').replace('\r\n', '\n').replace('\r', '\n')

def parse_unt(path):
    text = read_cp1255(path)
    lines = text.split('\n')
    # Remove empty trailing lines
    while lines and not lines[-1].strip():
        lines.pop()
    if len(lines) < 2:
        return None
    title = lines[0].strip()
    count_str = lines[1].strip()
    try:
        count = int(count_str)
    except:
        return None
    questions = []
    i = 2
    while i + 3 < len(lines) and len(questions) < count:
        expr = lines[i].strip()
        answer = lines[i+1].strip()
        op = lines[i+2].strip()
        flag = lines[i+3].strip() if i+3 < len(lines) else ''
        if expr:
            questions.append({'expr': expr, 'answer': answer, 'op': op})
        i += 4
    return {'title': title, 'questions': questions}

def parse_rama(path):
    text = read_cp1255(path)
    lines = text.split('\n')
    entries = []
    current_id = None
    current_tips = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if line.startswith('@'):
            current_tips.append(line[1:].strip())
        else:
            # Try to parse as integer (unit id)
            try:
                val = int(line)
                if current_id is not None:
                    # Save previous entry (was only an id with no name yet, unusual)
                    pass
                current_id = val
                current_tips = []
            except:
                # It's a name line
                if current_id is not None:
                    entries.append({'id': current_id, 'name': line, 'tips': current_tips})
                    current_id = None
                    current_tips = []
    return entries

# Parse all unit files
units = {}
for fname in os.listdir(SRC):
    if not fname.endswith('.unt'):
        continue
    uid = fname[:-4]
    try:
        int(uid)
    except:
        continue
    parsed = parse_unt(os.path.join(SRC, fname))
    if parsed:
        units[uid] = parsed

# Parse level files
levels = []
level_names = ['א', 'ב', 'ג', 'ד', 'ה']
for i in range(1, 6):
    rpath = os.path.join(SRC, f'Rama{i}.txt')
    if not os.path.exists(rpath):
        continue
    entries = parse_rama(rpath)
    if entries:
        levels.append({
            'name': f'רמה {level_names[i-1]}',
            'units': [e['id'] for e in entries],
            'unitNames': {str(e['id']): e['name'] for e in entries}
        })

print(f"Parsed {len(units)} units, {len(levels)} levels")
for lvl in levels:
    print(f"  {lvl['name']}: {len(lvl['units'])} units")

# Write JS module
with open(OUT, 'w', encoding='utf-8') as f:
    f.write('// Auto-generated unit data\n')
    f.write('const UNITS_DATA = ')
    json.dump({'units': units, 'levels': levels}, f, ensure_ascii=False, indent=2)
    f.write(';\n')

print(f"Written to {OUT}")
