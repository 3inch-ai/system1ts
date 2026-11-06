# Live local H2O SDK smoke — 2026-11-06

**PASS: actual native System One inference**, separate from synthetic contract/runtime tests. The implementation run completed at **2026-11-06T08:28:21.302Z**; the parent session independently repeated the guarded SDK smoke successfully during review. No hosted API key or paid endpoint was used.

## Deployment identity and scope

- Native endpoint: `http://127.0.0.1:8741/v1/systemone`.
- Existing local **MLX Q8**, upstream model **v1.4.1**, identified/started by the parent session. The implementation did not download weights or launch/stop this server.
- Local serving repo `h2o-lightning-mlx` commit verified using git: `1aebbd14345204da9e43246734afc128d32c8232`.
- Shim upstream pin supplied by the parent deployment record: `cc18ee330e6895c41b9a60f37a0dd122dc4c3461`.
- Health independently read: `ok: true`, model `h2oai/h2o-lightning-4b`, `attention_mode: bidirectional`, modes causal/bidirectional, `max_options: 255`, state compact, max_state_tokens 32000, vllm_max_model_len 40960. The local wrapper presents a vLLM-compatible backend on loopback 8743; these labels are not evidence that a new CUDA vLLM installation was tested.
- **Important calibration/version difference**: this older deployment's health reports `noul_floor.value: 0.801`, source `serve_config.json`; choice/noul/score temperatures 0.75/0.8/0.65. Current upstream model-card defaults differ (the newer default yes/no floor is 0). Do not generalize the tested deployment's floor or judgments to current main.

## Reproducible opt-in command

With an authorized, already-running loopback model:

```sh
SYSTEM1TS_ALLOW_LOCAL_LIVE=1 npm run smoke:live-local
```

Optional `SYSTEM1TS_LOCAL_URL` and `SYSTEM1TS_LOCAL_MODEL` select a loopback service/model; the script refuses non-loopback, non-HTTP and credential/query-bearing URLs. Without the explicit opt-in flag it refuses to run. The script builds first and makes **one batched request per invocation**, three questions (predicate, choice, score), using synthetic, non-personal text about a duplicate subscription charge. It is never part of `npm test`, `npm run check`, CI, packaging or import initialization. The SDK itself does not read environment variables; this separate developer script does.

## Implementation-run observations

| Field                 | Actual value                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| HTTP                  | 200                                                                                                                 |
| Requested model       | `h2oai/h2o-lightning-4b`                                                                                            |
| Actual response model | `h2oai/h2o-lightning-4b`                                                                                            |
| Top-level SDK issues  | `[]`                                                                                                                |
| `duplicate` predicate | status `ok`, probability `0.9285236199495673`                                                                       |
| `department` choice   | status `ok`, choice `billing`, billing probability `0.9576025733825381`, shipping probability `0.04239742661746191` |
| `urgency` score       | status `ok`, returned score and separate computedScore both `0.03392228356590983`                                   |
| Provider metadata     | probability_source `native`, effort_used `{tier: "fast", passes_per_decision: 1}`, attention_mode `bidirectional`   |
| Reported usage        | input_tokens `183`, processed_input_tokens `315`, output_tokens `3`, latency_ms `863.5`                             |

Original answer objects, score legend, distributions, provider confidence, model and metadata survived normalization. No usage total or price was fabricated. The latency is **one server-reported observation, not a benchmark**. The three plausible judgments are not an accuracy/calibration evaluation.

## Still unverified

Official hosted Jev and OpenAI Decisions; current upstream H2O main/v1.4.2 deployment; the local shim's distinct `/v1/decisions` handler; images, Box, mode switching, higher score-level counts, remote/cloud deployment and model-quality/performance claims. The default H2O preset still declares conservative native System One limits; this smoke does not prove every possible request or label budget.
