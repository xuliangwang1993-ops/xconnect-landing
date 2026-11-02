window.XCF_ASSISTANT_TOOLS = {
  "generated_at": "2026-10-26T07:32:02.014Z",
  "assistant": {
    "id": "duck-lee",
    "runner": "grok-build-cli",
    "protocol": "MCP 2025-11-25",
    "verified_transports": [
      {
        "server": "xc-tools",
        "status": "handshake_tools_list_verified",
        "tools": 6
      },
      {
        "server": "xconnect",
        "status": "handshake_tools_list_verified_tools_call_auth_expired",
        "tools": 6,
        "action": "Sign in to X-Connect and refresh the MCP bearer token before calling tools"
      }
    ]
  },
  "groups": {
    "probe": [
      "pod_info",
      "tool_inventory"
    ],
    "media": [
      "ffprobe",
      "pyscenedetect"
    ],
    "audio": [
      "sox_info"
    ],
    "image": [
      "opencv_info"
    ]
  },
  "tools": [
    {
      "name": "pod_info",
      "description": "Show configured factory worker status. Read-only; never starts or stops a pod.",
      "group": "probe",
      "verified": true,
      "read_only": true,
      "endpoint": "xc-tools",
      "transport": "grok-stdio"
    },
    {
      "name": "tool_inventory",
      "description": "List MCP tool deployments and evidence states; an inventory entry is not proof of a working tool.",
      "group": "probe",
      "verified": true,
      "read_only": true,
      "endpoint": "xc-tools",
      "transport": "grok-stdio"
    },
    {
      "name": "ffprobe",
      "description": "Inspect one media file inside the task workspace and return its JSON streams.",
      "group": "media",
      "verified": true,
      "read_only": true,
      "endpoint": "xc-tools",
      "transport": "grok-stdio"
    },
    {
      "name": "pyscenedetect",
      "description": "Detect scene boundaries for one video in the task workspace; requires a video input.",
      "group": "media",
      "verified": true,
      "read_only": true,
      "endpoint": "xc-tools",
      "transport": "grok-stdio"
    },
    {
      "name": "sox_info",
      "description": "Inspect audio format, channels and duration for a file in the task workspace.",
      "group": "audio",
      "verified": true,
      "read_only": true,
      "endpoint": "xc-tools",
      "transport": "grok-stdio"
    },
    {
      "name": "opencv_info",
      "description": "Inspect image dimensions and channels for an image in the task workspace.",
      "group": "image",
      "verified": true,
      "read_only": true,
      "endpoint": "xc-tools",
      "transport": "grok-stdio"
    }
  ],
  "connected_servers": [
    {
      "name": "xc-tools",
      "tools": 6,
      "status": "probe_ready",
      "credential_required": false
    },
    {
      "name": "xconnect",
      "tools": 6,
      "status": "connected_auth_refresh_required",
      "tool_names": [
        "health_check",
        "list_models",
        "get_balance",
        "invoke_model",
        "save_work_checkpoint",
        "read_work_checkpoint"
      ]
    }
  ],
  "planned_adapters": {
    "mlt": "CLI: bounded melt composition; requires render smoke test",
    "yt_dlp": "network download: separate domain allowlist and opt-in quota",
    "audiowaveform": "CLI: waveform render; requires sample test",
    "rubberband": "CLI: duration/pitch transform; requires sample test",
    "ffmpeg_normalize": "CLI: loudness normalization; requires sample test",
    "demucs": "GPU job: separation model and output contract",
    "whisperx": "GPU job: transcription model and output contract",
    "cosyvoice2": "GPU job: isolated Python 3.10 environment and reference-audio contract",
    "real_esrgan": "GPU job: upscale model and output contract",
    "craft": "separate Craft MCP gateways, not factory binaries by default"
  },
  "boundaries": {
    "no_arbitrary_shell": true,
    "no_pod_lifecycle_by_default": true,
    "task_scoped_groups": true,
    "input_root": "XC_TASK_ROOT",
    "order_flow": "preview_only_until_authorized"
  }
};
