# Nearby model transfer (preview)

Share an installed GGUF model directly with another LLMHub phone on the same Wi-Fi network. Internet access is not required for the transfer. This implementation is a foreground preview; Android/iOS native builds and physical two-device validation remain pending.

## Use

1. On the sender, open Models and press the send icon beside an installed model.
2. Wait for file checks. Show the pairing key; keep it private.
3. On the receiver, press **Receive model nearby**. Select a discovered sender or enter its displayed IPv4 address (port 8081).
4. Enter the sender's 48-character pairing key and press **Review model**.
5. Review size, license, source verification and storage, then press **Accept and receive**. Vision bundles include the projector.
6. Keep both apps open until verification finishes. The receiver can then load the model from Your models.

Discovery uses Android NSD and iOS Bonjour (`_llmhub-share._tcp`). Manual addresses work when discovery fails. Guest-network isolation can block both. This version requires a shared Wi-Fi network; Bluetooth, Wi-Fi Direct, public torrents and multi-peer swarms are not implemented.

## Pause and recovery

Pause, closing the sheet, or leaving the foreground stops the session and clears displayed pairing secrets. Complete chunks remain in private `incoming` storage. Pair again with identical model/projector bytes to resume. A restarted sender creates a new key. One sender admits one receiver per session; restart sharing to change receivers.

Resume identity includes every artifact's size, hash and bundle order. Changed bytes cannot reuse a partial transfer. A file interrupted mid-write or failing its final checksum requires **Delete partial transfer** before retrying. A different model cannot replace an existing partial transfer silently. Verification may finish its running file hash before a pause completes.

After all files pass size, GGUF-header and SHA-256 checks, files move into private model storage and imported-model registration commits. Failed registration rolls files back. Recovery returns unregistered staged files to partial storage after app termination; registered files stay installed. Incoming storage contains no saved pairing key or Hugging Face token.

## Protocol and privacy

Model transfer has an independent `ModelTransferHttp` transport instance and event namespace. It does not share LAN-inference sessions, bearer keys, or routes. Chat messages, documents and Hugging Face tokens are never part of the transfer.

The native file bridge reads/writes at most 256 KiB per chunk. Native methods restrict sender reads to private `models` files and receiver writes to private `incoming` files. Whole GGUF files do not pass through JavaScript.

A native secure random generator creates a 192-bit pairing secret as 48 lowercase hexadecimal characters. Domain-separated SHA-256 derivation produces:

- HTTP authorization: first 24 digest bytes of UTF-8 `llmhub-transfer-auth-v1:<secret>`, hex encoded.
- AES-256 key: digest of UTF-8 `llmhub-transfer-enc-v1:<secret>`.

The pairing secret is not an HTTP header or request field. Control payloads and file chunks use AES-GCM with fresh 12-byte nonces and 16-byte authentication tags. Both native implementations encode `nonce || ciphertext || tag` as base64. Authenticated associated data binds control direction/request ID, and chunk offer/artifact/offset/length/request ID. HTTP headers, network addresses, timing and ciphertext lengths remain visible; this does not add encryption to the separate LAN-inference feature.

Sender checksum verification proves the transferred bytes match the offered bytes. It does not prove publisher identity. Only a complete hash/size match against the receiver's bundled model catalog earns independently verified source metadata; other imports show publisher authenticity as unverified. Licenses remain the user's responsibility. Models received nearby have no automatic remote-download URL.

RAM fit remains unverified for arbitrary peer models. File size is not enough to calculate KV cache or inference buffers; receiving a model does not promise it can load. Storage is checked against the remaining bundle size plus a 256 MiB margin before receiving.

## Validation

JavaScript protocol, simulated two-session encrypted transfer, interruption, resume, tampering, final-hash rejection, competing receiver admission, storage limits, promotion rollback and recovery have automated tests. These use a Node AES-GCM adapter; they do not certify Android Crypto providers or iOS CryptoKit interoperability.

Before treating this preview as device verified, rebuild both native apps and record:

- Android → Android, iPhone → iPhone, Android → iPhone and iPhone → Android transfers, including a vision bundle.
- Matching source/destination SHA-256 hashes, ordinary GGUF loading, and pairing keys absent from captured HTTP traffic.
- Offline Wi-Fi, permission denial, manual pairing, isolated Wi-Fi, lost connection, backgrounding, sender/receiver restarts, and resumed tails.
- Multi-GB transfers, low storage, corrupt ciphertext, corrupt partial files and projector failure; no partial model should appear as installed.
- LAN inference and nearby transfer transport isolation, native module registration, and discovery cleanup.
