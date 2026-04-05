# x402Bench Pitch Decks

Generated decks:
- `x402Bench_Cannes2026_Judge_Story.pptx`
- `x402Bench_Cannes2026_Technical_DeepDive.pptx`

Generator source:
- `build_pitch_decks.cjs`

## Rebuild

```bash
node pitches/build_pitch_decks.cjs
```

The generator reads the latest readiness artifact from:
- `readiness_bench/results/*.json`

and writes metadata to:
- `pitches/pitch_decks_manifest.json`
- `pitches/latest_metrics.json`

## Slide Helper Assets

Copied from the local `slides` skill:
- `pitches/pptxgenjs_helpers/`

The generator imports overlap/bounds diagnostics from:
- `pitches/pptxgenjs_helpers/layout.cjs`

## Optional Render/Overflow Validation

A local Python venv is included at `pitches/.venv` with:
- `numpy`, `pillow`, `pdf2image`, `python-pptx`

Validation scripts (copied from the `slides` skill):
- `pitches/slides_test.py`
- `pitches/render_slides.py`
- `pitches/create_montage.py`

Note: `slides_test.py` and `render_slides.py` require LibreOffice `soffice` on PATH. If `soffice` is not installed, deck generation still works, but rasterized validation cannot run.
