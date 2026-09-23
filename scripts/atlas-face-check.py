# ATLAS 캐릭터 얼굴 일치 검수 — ArcFace(insightface buffalo_l) 코사인 유사도. 로컬 실행, 유료 API 없음.
#
#   <ComfyUI venv python> scripts/atlas-face-check.py <channel> <topicSlug> [--write]
#   <ComfyUI venv python> scripts/atlas-face-check.py --files a.png b.png ...
#
# 기준 얼굴은 정책 파일이 정한 마스터(해외: ATLAS-MIJI-MASTER.png)다.
# 얼굴을 못 찾으면 fail(뒷모습 등 얼굴이 안 보이는 컷은 검수할 수 없으므로 통과가 아니다).
# --write 는 data/atlas/scene-art/<channel>-<topic>.json 의 items[role].faceMatch 에 결과를 기록한다.
# 운영자 fail 기록(method=operator_review)은 점수로 덮어쓰지 않는다.
import json
import os
import sys
from datetime import datetime, timezone

import cv2
import numpy as np
from insightface.app import FaceAnalysis

THRESHOLD = 0.5  # lib/atlas/face-match.js FACE_MATCH_THRESHOLD 와 같아야 한다.
MASTERS = {"global": "public/atlas/characters/ATLAS-MIJI-MASTER.png"}
ROOT = os.getcwd()

app = FaceAnalysis(name="buffalo_l", providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
app.prepare(ctx_id=0, det_size=(640, 640))


def embedding(path):
    img = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)
    faces = app.get(img)
    if not faces:
        return None, 0
    face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
    return face.normed_embedding, len(faces)


def score(master_emb, path):
    emb, count = embedding(path)
    if emb is None:
        return {"status": "fail", "similarity": 0.0, "faces": 0, "reason": "얼굴을 찾지 못함"}
    sim = float(np.dot(master_emb, emb))
    return {"status": "pass" if sim >= THRESHOLD else "fail", "similarity": round(sim, 4), "faces": count}


def main(argv):
    if argv[:1] == ["--files"]:
        master_emb, _ = embedding(os.path.join(ROOT, MASTERS["global"]))
        for f in argv[1:]:
            print(json.dumps({"file": f, **score(master_emb, f)}, ensure_ascii=False))
        return
    channel, slug = argv[0], argv[1]
    write = "--write" in argv
    master = MASTERS[channel]
    master_emb, _ = embedding(os.path.join(ROOT, master))
    manifest_path = os.path.join(ROOT, "data", "atlas", "scene-art", f"{channel}-{slug}.json")
    with open(manifest_path, encoding="utf-8") as fh:
        manifest = json.load(fh)
    now = datetime.now(timezone.utc).isoformat()
    for role, item in manifest["items"].items():
        result = score(master_emb, os.path.join(ROOT, item["file"]))
        record = {**result, "threshold": THRESHOLD, "method": "arcface_buffalo_l", "reference": master, "checkedAt": now}
        prior = item.get("faceMatch") or {}
        if prior.get("method") == "operator_review" and prior.get("status") == "fail":
            record = {**prior, "arcface": record}
        print(role, record["status"], record.get("similarity", record.get("arcface", {}).get("similarity")))
        if write:
            item["faceMatch"] = record
    if write:
        with open(manifest_path, "w", encoding="utf-8") as fh:
            fh.write(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main(sys.argv[1:])
