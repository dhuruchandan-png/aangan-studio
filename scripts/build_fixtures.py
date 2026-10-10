"""Parse Aangan_Sep 2026_Enquiries.pdf into fixtures + embed knowledge files.
Run: python3 scripts/build_fixtures.py ["/path/to/Aangan_Sep 2026_Enquiries.pdf"]
Writes scripts/fixtures/phone/T01..T20.json, scripts/fixtures/phone.json (all 20),
scripts/fixtures/other/*.json (WhatsApp + web form, parsed but never routed) and lib/knowledge.ts.
pricing.md is deliberately NOT read or embedded anywhere."""
import re, json, sys, os
from pypdf import PdfReader

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pdf = sys.argv[1] if len(sys.argv) > 1 else "/Users/apple/Downloads/Aangan_Sep 2026_Enquiries.pdf"
txt = " ".join(p.extract_text() for p in PdfReader(pdf).pages)
txt = re.sub(r"\s+", " ", txt).replace("’", "'").replace("“", '"').replace("”", '"')
txt = re.sub(r"SECTION \d — [A-Z ]+ .*?(?=\b[TWF]\d{2} · |$)", " ", txt) if False else txt
parts = re.split(r"\b((?:T|W|F)\d{2}) · ", txt)
raw = {parts[i]: parts[i + 1].strip() for i in range(1, len(parts), 2)}
# drop trailing section headings that follow T20 / W10
raw["T20"] = re.split(r" SECTION 2", raw["T20"])[0]
raw["W10"] = re.split(r" SECTION 3", raw["W10"])[0]

MONTHS = {m: i + 1 for i, m in enumerate(["January","February","March","April","May","June","July","August","September","October","November","December"])}

def iso(day, month, hm):
    h, m = hm
    return f"2026-{MONTHS[month]:02d}-{int(day):02d}T{h:02d}:{m:02d}:00+05:30"

def hm_of(t, ap):
    h, m = [int(x) for x in t.split(":")]
    if ap == "pm" and h != 12: h += 12
    if ap == "am" and h == 12: h = 0
    return h, m

def turns_of(body):
    out = []
    for sp, tx in re.findall(r"(Front Desk|Caller): (.*?)(?= (?:Front Desk|Caller): |$)", body):
        out.append({"speaker": "agent" if sp == "Front Desk" else "caller", "text": tx.strip()})
    return out

def split_note(body):
    m = re.search(r" Note: (.*)$", body)
    return (body[:m.start()], m.group(1).strip()) if m else (body, None)

def after_hours(iso_s):
    import datetime
    d = datetime.datetime.fromisoformat(iso_s)
    return d.weekday() == 6 or not (10 <= d.hour < 19)

EXPECT = {
 "T01": dict(verdicts=["qualified"], referral="Shruti Joshi"),
 "T02": dict(verdicts=["qualified"], price_asked=True),
 "T03": dict(verdicts=["not_a_fit"]),
 "T04": dict(verdicts=["not_a_fit"]),
 "T05": dict(verdicts=["qualified"], referral="Vikram Agarwal"),
 "T06": dict(verdicts=["qualified"]),
 "T07": dict(verdicts=["unsure", "not_a_fit"]),
 "T08": dict(missed=True),
 "T09": dict(verdicts=["escalate"]),
 "T10": dict(verdicts=["not_a_fit"]),
 "T11": dict(verdicts=["qualified"]),
 "T12": dict(verdicts=["qualified"]),
 "T13": dict(verdicts=["qualified"], price_asked=True),
 "T14": dict(verdicts=["qualified"], decision_maker_note=True),
 "T15": dict(verdicts=["qualified"]),
 "T16": dict(verdicts=["qualified"], priority=True),
 "T17": dict(verdicts=["qualified"], merged_calls=2),
 "T18": dict(verdicts=["not_a_fit", "unsure"]),
 "T19": dict(verdicts=["not_a_fit"]),
 "T20": dict(verdicts=["qualified"]),
}

phone = []
for n in range(1, 21):
    code = f"T{n:02d}"
    body = raw[code]
    number = f"+9190000{n:05d}"
    fx = {"id": code, "channel": "phone", "caller_number": number, "calls": [], "staff_note": None,
          "history": None, "missed": False, "expect": EXPECT[code]}
    if code == "T08":
        m = re.match(r"Phone · (\d+) (\w+) · (\d+:\d+)(am|pm) · MISSED CALL (.*)", body)
        fx.update(missed=True, started_at=iso(m[1], m[2], hm_of(m[3], m[4])), staff_note=m[5].strip(), label="Missed call, no voicemail")
        fx["after_hours"] = after_hours(fx["started_at"])
        phone.append(fx); continue
    if code == "T17":
        m = re.match(r"Phone · (\d+) (\w+) · (\d+:\d+)(am|pm) then (\d+:\d+)(am|pm) First call — disconnected at (\d+) min (\d+) sec (.*?) Second call — (\d+) min (\d+) sec (.*)", body)
        s1, s2 = iso(m[1], m[2], hm_of(m[3], m[4])), iso(m[1], m[2], hm_of(m[5], m[6]))
        fx["calls"] = [
            {"started_at": s1, "duration_sec": int(m[7]) * 60 + int(m[8]), "turns": turns_of(m[9]), "dropped": True},
            {"started_at": s2, "duration_sec": int(m[10]) * 60 + int(m[11]), "turns": turns_of(m[12])},
        ]
        fx.update(started_at=s1, label="Dropped call, then call back")
    else:
        m = re.match(r"Phone · (\d+) (\w+) · (\d+:\d+)(am|pm) · (\d+) min (\d+) sec(?: — ESCALATE)? (.*)", body)
        s = iso(m[1], m[2], hm_of(m[3], m[4]))
        content, note = split_note(m[7])
        fx["calls"] = [{"started_at": s, "duration_sec": int(m[5]) * 60 + int(m[6]), "turns": turns_of(content)}]
        fx.update(started_at=s, staff_note=note, label=content[:0])
    fx["after_hours"] = after_hours(fx["started_at"])
    phone.append(fx)

LABELS = {"T01":"Referral, full 3BHK","T02":"Asks price twice","T03":"Nashik (out of area)","T04":"Ideas only, no execution","T05":"Referral via Nikhil's friend","T06":"800 sq ft startup office","T07":"Wants it before Diwali","T09":"Existing client complaint","T10":"₹1–1.5 lakh budget","T11":"Rented 2BHK","T12":"5,500 sq ft villa","T13":"Asks price, then books","T14":"Son calling for parents","T15":"Possession in six weeks","T16":"Repeat, frustrated caller","T17":"Dropped call then call back","T18":"180 sq ft coworking pod","T19":"Restaurant (out of scope)","T20":"Magarpatta 2BHK"}
for fx in phone:
    fx["label"] = LABELS.get(fx["id"], fx.get("label") or fx["id"])
phone[15]["history"] = {"prior_at": "2026-09-14T15:30:00+05:30", "prior_ref": "AG-0099", "prior_status": "routed", "note": "Called Monday; nobody followed up"}

fx_dir = os.path.join(ROOT, "scripts", "fixtures")
os.makedirs(os.path.join(fx_dir, "phone"), exist_ok=True); os.makedirs(os.path.join(fx_dir, "other"), exist_ok=True)
for fx in phone:
    json.dump(fx, open(os.path.join(fx_dir, "phone", fx["id"] + ".json"), "w"), indent=1, ensure_ascii=False)
json.dump(phone, open(os.path.join(fx_dir, "phone.json"), "w"), indent=1, ensure_ascii=False)
others = []
for k, v in raw.items():
    if k[0] in "WF":
        o = {"id": k, "channel": "whatsapp" if k[0] == "W" else "web", "raw": v, "routed": False}
        others.append(o)
        json.dump(o, open(os.path.join(fx_dir, "other", k + ".json"), "w"), indent=1, ensure_ascii=False)
json.dump(others, open(os.path.join(fx_dir, "other.json"), "w"), indent=1, ensure_ascii=False)

def md(name): return open(os.path.join(ROOT, "knowledge", name), encoding="utf-8").read()
ts = "// GENERATED by scripts/build_fixtures.py from knowledge/*.md. Do not edit by hand.\n// pricing.md is intentionally absent: the voice agent and Gemini never see it.\n"
ts += f"export const SERVICES_MD = {json.dumps(md('services.md'), ensure_ascii=False)};\n"
ts += f"export const QUALIFIED_MD = {json.dumps(md('qualified.md'), ensure_ascii=False)};\n"
open(os.path.join(ROOT, "lib", "knowledge.ts"), "w", encoding="utf-8").write(ts)
print("phone fixtures:", len(phone), "other:", len(others))
for fx in phone:
    print(fx["id"], fx["started_at"], "AH" if fx["after_hours"] else "  ", [len(c["turns"]) for c in fx["calls"]], (fx["staff_note"] or "")[:50])
