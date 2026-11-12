#!/bin/bash
# Converts raw CC0 source packs (see CREDITS.md) into optimised GLBs under public/assets.
# usage: RAW=/path/to/raw tools/build-assets.sh
set -u
RAW="${RAW:?set RAW to the folder holding the source packs}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/assets"
GT="$(cd "$(dirname "$0")/.." && pwd)/node_modules/.bin/gltf-transform"
opt(){ # src dst texsize
  local src="$1" dst="$OUT/$2" ts="${3:-512}"; mkdir -p "$(dirname "$dst")"; [ -s "$dst" ] && return
  "$GT" optimize "$src" "$dst" --compress meshopt --texture-compress webp --texture-size "$ts" \
    --flatten false --join false --simplify false --palette false --instance false >/dev/null 2>&1 || echo "FAIL $src"
}
export -f opt; export OUT GT
J=()
add(){ J+=("$1|$2|${3:-512}"); }
A="$RAW/quaternius-animated-animals/3D/characters"
for n in Deer Stag Fox Wolf Bull Cow Alpaca Husky; do add "$A/$n.gltf" "animals/$n.glb"; done
M=$(dirname "$(find "$RAW/quaternius-ultimate-monsters" -name Bunny.gltf | head -1)")
add "$M/Bunny.gltf" animals/Bunny.glb
for f in $(find "$RAW/quaternius-ultimate-monsters" -name 'Yeti.gltf'); do add "$f" "animals/Yeti_$(basename "$(dirname "$f")").glb"; done
K="$RAW/kaykit-adventurers/3D/characters"
for f in $(find "$K" -name '*.glb' | grep -v Rig_ | grep -v Large); do add "$f" "chars/$(basename "$f")" 1024; done
for f in "$RAW"/kaykit-character-animations/3D/characters/Animations/gltf/Rig_Medium/*.glb; do add "$f" "anims/$(basename "$f" | sed 's/Rig_Medium_//')"; done
for f in "$K"/Assets/gltf/*.gltf; do add "$f" "weapons/$(basename "${f%.gltf}").glb"; done
for f in "$RAW"/kaykit-fantasy-weapons/3D/weapons/Assets/gltf/*.gltf; do add "$f" "weapons/$(basename "${f%.gltf}").glb"; done
for f in "$RAW"/quaternius-stylized-nature/3D/nature/*.gltf; do add "$f" "nature/$(basename "${f%.gltf}").glb" 512; done
for f in "$RAW"/quaternius-fantasy-props/3D/fantasy/glTF/*.gltf; do add "$f" "props/$(basename "${f%.gltf}").glb" 512; done
for f in "$RAW"/kenney-survival-kit/3D/nature/Models/GLB\ format/*.glb; do add "$f" "props/k_$(basename "$f")"; done
H="$RAW/kaykit-medieval-hexagon/3D/strategy-hex/Assets/gltf"
for f in "$H"/buildings/blue/*.gltf "$H"/buildings/neutral/*.gltf "$H"/decoration/props/*.gltf "$H"/units/neutral/cart*.gltf; do
  [ -f "$f" ] && add "$f" "town/$(basename "${f%.gltf}").glb"; done
printf '%s\n' "${J[@]}" | xargs -d '\n' -P 8 -I{} bash -c 'IFS="|" read -r a b c <<< "$1"; opt "$a" "$b" "$c"' _ {}
# audio
mkdir -p "$OUT/audio"
for d in kenney-rpg-audio kenney-ui-audio kenney-impact-sounds kenney-foley-sounds kenney-music-jingles; do
  find "$RAW/$d" -name '*.ogg' -exec cp -n {} "$OUT/audio/" \;
done
du -sh "$OUT"/*
# keep only what the game actually requests (list recorded from a real boot)
if [ -f "$(dirname "$0")/used-assets.txt" ]; then
  (cd "$OUT" && find . -type f | sed 's#^\./##' | sort | comm -23 - <(sort "$(dirname "$0")/used-assets.txt") | while read -r f; do rm -f "$f"; done)
fi
