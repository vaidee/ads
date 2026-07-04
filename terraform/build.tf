# Bundles every function in local.bundled_functions with esbuild (pulls in `pg`
# and functions/shared/* via relative imports - mirrors infra/template.yaml's
# BuildMethod: esbuild for SAM). log-duplicate-skip has no dependencies, so it's
# zipped as-is. api.tf handles the "api" Lambda's build separately.

resource "null_resource" "build" {
  for_each = toset(local.bundled_functions)

  triggers = {
    # Any function file changing invalidates every build - these all pull from
    # functions/shared/* via relative imports esbuild resolves at bundle time,
    # so a shared-file change needs to be caught even though it's not in
    # each.key's own directory.
    functions_hash = sha1(join("", [
      for f in fileset("${path.module}/../functions", "**/*.js") :
      filesha256("${path.module}/../functions/${f}")
    ]))
  }

  provisioner "local-exec" {
    working_dir = "${path.module}/.."
    command     = "npx esbuild functions/${each.key}/index.js --bundle --platform=node --target=node20 --external:@aws-sdk/* --outfile=terraform/dist/${each.key}/index.js"
  }
}

data "archive_file" "bundled" {
  for_each = toset(local.bundled_functions)

  type        = "zip"
  source_dir  = "${path.module}/dist/${each.key}"
  output_path = "${path.module}/dist/${each.key}.zip"
  depends_on  = [null_resource.build]
}

data "archive_file" "log_duplicate_skip" {
  type        = "zip"
  source_dir  = "${path.module}/../functions/log-duplicate-skip"
  output_path = "${path.module}/dist/log-duplicate-skip.zip"
}
