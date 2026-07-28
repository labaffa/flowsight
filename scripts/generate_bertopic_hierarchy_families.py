#!/usr/bin/env python3
"""Cut BERTopic's hierarchy into stable, analyst-readable colour families."""
from __future__ import annotations
import ast, csv, sys
from pathlib import Path

def rows(path):
    with path.open(encoding='utf-8', newline='') as handle: return list(csv.DictReader(handle, delimiter='\t'))

def main(hierarchy_path: str, output_path: str, max_leaves: str):
    nodes={row['Parent_ID']:row for row in rows(Path(hierarchy_path))}; cap=int(max_leaves)
    root=max(nodes, key=lambda key: len(ast.literal_eval(nodes[key]['Topics'])))
    families=[]
    def walk(node_id):
        node=nodes[node_id]; leaves=ast.literal_eval(node['Topics'])
        if len(leaves)<=cap:
            families.append((node_id,node['display_label'],leaves)); return
        for child in (node['Child_Left_ID'],node['Child_Right_ID']):
            if child in nodes: walk(child)
            else: families.append((child,f'Topic {child}',[int(child)]))
    walk(root)
    output=Path(output_path); output.parent.mkdir(parents=True,exist_ok=True)
    with output.open('w',encoding='utf-8',newline='') as handle:
        writer=csv.DictWriter(handle,fieldnames=['topic_id','family_id','family_label'],delimiter='\t');writer.writeheader()
        for family_id,label,leaves in families:
            for topic_id in leaves: writer.writerow({'topic_id':topic_id,'family_id':family_id,'family_label':label})

if __name__=='__main__': main(*sys.argv[1:])
