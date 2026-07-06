locals {
  # Every pipeline Lambda except log-duplicate-skip needs Postgres access (hence
  # VPC + the DB secret); api is deliberately NOT in this map - it has enough
  # extra permissions (S3, TwelveLabs, StartExecution) and needs to reference
  # the state machine ARN, which would create a dependency cycle if it were
  # unified into the same for_each as the state machine's own Task resources.
  function_config = {
    "trigger-ingest" = { timeout = 30, memory = 256 }
    # TwelveLabs' POST /tasks fetches and validates the video from the
    # presigned URL synchronously before responding - this can take
    # noticeably longer than the trivial parameter-validation failures seen
    # while debugging (all of which returned in well under 30s), so this
    # needs more headroom than the other DB-only-call Lambdas.
    "index-video"             = { timeout = 60, memory = 256 }
    "check-indexing-status"   = { timeout = 30, memory = 256 }
    "run-compliance-analysis" = { timeout = 60, memory = 512 }
    "parse-and-persist"       = { timeout = 30, memory = 256 }
    "apply-suggestion-logic"  = { timeout = 30, memory = 256 }
    "persist-final"           = { timeout = 30, memory = 256 }
    "handle-pipeline-error"   = { timeout = 30, memory = 256 }
    "weekly-eval"             = { timeout = 60, memory = 256 }
  }

  # Bundled with esbuild (they all pull in `pg` and functions/shared/* via
  # relative imports). log-duplicate-skip has no dependencies, so it's zipped
  # as-is, and api is bundled separately in api.tf.
  bundled_functions = keys(local.function_config)

  needs_tl_secret = toset(["index-video", "check-indexing-status", "run-compliance-analysis"])
  needs_s3_read   = toset(["trigger-ingest"])

  # Only these call TwelveLabs over the public internet, so only these need a
  # NAT-routed subnet (Tier B). Everything else - including trigger-ingest,
  # which only calls S3 (via the Gateway Endpoint) and Secrets Manager (via
  # the Interface Endpoint, reachable VPC-wide since it has Private DNS
  # enabled) - stays in the DB-only subnets (Tier A) with no internet route.
  nat_functions = toset(["index-video", "check-indexing-status", "run-compliance-analysis"])
}
