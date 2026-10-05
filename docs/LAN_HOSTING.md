# Local Wi-Fi hosting (preview)

One LLMHub phone runs a loaded model; another LLMHub phone connects over the same Wi-Fi without downloading that model. This is foreground-only LAN inference, not a Wi-Fi router, model transfer, distributed inference, or an Android shared-runtime SDK.

## Use it

1. Rebuild both apps after applying the patch. Android registers `LanHttpPackage`; iOS includes `LanHttp.mm` and a Local Network permission description. A JavaScript reload alone cannot install the native transport.
2. Connect both phones to the same trusted Wi-Fi. Guest networks and access-point client isolation may block phone-to-phone connections. Internet access is unnecessary once the host model is downloaded.
3. On the host, load a model in **Models**, then open **Settings → Local Wi-Fi → Host loaded model**. The server binds the Wi-Fi IPv4 address on port 8080. Local chat and model changes are paused while hosting.
4. Use **Show access key** to copy the displayed address and key to the other phone. The key is selectable text and is kept in memory. Sharing within a system sheet is supported, but switching to another app or locking/backgrounding the host stops hosting and invalidates its key. Restart hosting and use the new key if that happens.
5. On the client, enter the address and key in the same Settings section, tap **Connect to host**, then **Open LAN chat**. No local model is required. Chat history, JSON import/export, and connected local documents continue to work.
6. Keep both apps in the foreground. **Disconnect** returns the client to local mode; **Stop hosting** frees the host for local chat. A background transition disconnects LAN mode. A loaded local model may also need to be loaded again after backgrounding under the existing memory policy.

On iOS, allow Local Network access if requested. A denied permission, an occupied host port, Wi-Fi changes, or an unreachable host produces an actionable error. After changing Wi-Fi, restart hosting and reconnect with its current address and key. IPv6, hostnames, hotspot interface detection, automatic discovery, and background hosting are not included.

## Privacy boundary

Local mode keeps inference on the originating phone. In LAN mode, messages and retrieved document passages are sent to the selected host. PDF originals and document indexes remain on the client; only retrieved reference text enters the inference request. The host processes requests in memory and does not save incoming conversations or log their content. The client retains its normal chat history.

The random 192-bit bearer key authorizes requests; it **does not encrypt traffic or authenticate the host cryptographically**. This preview uses plaintext HTTP over trusted Wi-Fi. Do not forward port 8080, use public/untrusted Wi-Fi, or send sensitive material requiring a secure channel. TLS/pinned pairing is a prerequisite for broader deployment. Keys and client connection details are not persisted, and every host start generates a new key.

## OpenAI-compatible subset

Both endpoints require `Authorization: Bearer ACCESS_KEY`:

| Endpoint | Supported behavior |
| --- | --- |
| `GET /v1/models` | One loaded model; `id`, `llmhub_name`, and `context_length` describe it. |
| `POST /v1/chat/completions` | Native OpenAI `model` and text `messages`; one completed JSON reply. |

Messages use string content with system/developer/user/assistant roles. They stay in the same shape used by chat storage and import/export. LAN transport does not introduce a second conversation format.

Optional sampling parameters: `max_tokens`, `temperature`, `top_p`, and `seed`. Defaults are snapshotted from host settings when hosting starts. Other sampling controls remain host-owned. `stream: true`, images/typed content parts, tools, and structured output are rejected explicitly. Replies contain `choices[0].message.content`; no token streaming is available in this preview.

One inference runs at a time; another completion receives HTTP 409 rather than queueing. The transport admits at most four concurrent inbound sockets, limits headers to 16 KiB and bodies to 1 MiB, bounds reads, and closes unhandled requests after three minutes. Generation is stopped after 150 seconds. Client cancellation closes its request socket; native disconnect events stop the matching host generation. Host Stop/background/model offload closes the listener and cancels inference. Cancellation timing and lifecycle require physical-device verification.

Prompt preparation applies the host context budget and can omit older messages, as local chat does. An oversized newest turn is rejected. The full stored conversation remains unchanged.

Example from a computer on the same Wi-Fi, substituting the displayed host address, key, and model ID:

```sh
curl http://192.168.1.10:8080/v1/models \
  -H 'Authorization: Bearer ACCESS_KEY'

curl http://192.168.1.10:8080/v1/chat/completions \
  -H 'Authorization: Bearer ACCESS_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"model":"MODEL_ID","messages":[{"role":"user","content":"Explain photosynthesis"}],"max_tokens":128,"stream":false}'
```

This is an app-owned HTTP transport around `llama.rn` completion, not the full standalone `llama-server` API. Arbitrary OpenAI servers are not accepted by the built-in client: it requires the LLMHub model metadata and a private literal IPv4 address.

## Validation

The current change passes TypeScript, ESLint, and 181 Jest tests across 27 suites. Android and iOS production JavaScript bundles also pass. JavaScript tests cover address/key validation, request shape and limits, OpenAI responses, concurrent inference rejection, connection without a local model, client cancellation, background/start races, and model offload. These tests mock the native socket transport.

Native builds and two-device behavior have **not been verified in this Linux workspace**. Before treating LAN mode as ready, record these checks on Android ARM64 and iPhone:

- Native clean build and permission allow/deny/retry; Android↔Android, iOS↔iOS, and cross-platform host/client combinations.
- Two phones on Wi-Fi with its internet uplink disabled; client has no downloaded model.
- Valid/invalid/missing key using curl; `/v1/models`, text completion, unsupported streaming/images/tools, malformed/oversized HTTP and JSON, and simultaneous requests.
- Client stop/disconnect while generating; host Stop, lock, background, memory warning, share sheet, and restart with a new key. Confirm old keys fail and model switching cannot overlap host inference.
- Wi-Fi loss/rejoin, guest-network isolation, port conflict, generation timeout, and repeated connect/disconnect without leaked sockets or contexts.
- Connected PDF retrieval and citations; confirm local files are not transferred and reference text is visible in the request boundary.
- Compare local mode after disconnect, normal downloads including Hugging Face tokens, and JSON import/export for regressions.

Platform references: [Apple local network privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy) and [Android local network permission](https://developer.android.com/privacy-and-security/local-network-permission). The project currently targets Android SDK 36 with INTERNET permission; review the local-network runtime permission before raising its target SDK.
