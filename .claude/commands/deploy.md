# Deploy Command

Pull the latest Docker image and restart the mp-charts container on ironside after verifying CI has completed.

## Instructions

1. **Check CI status**: Run `gh run list --repo The-Moody-Church/mp-charts --branch main --limit 1` and verify the most recent workflow completed successfully. If it's still in progress, wait and poll every 15 seconds until it completes (or fails). If it failed, stop and report the failure — do not deploy.

2. **Pull the new image**: SSH into ironside and pull + recreate:
   ```bash
   ssh ironside@192.168.4.81 "cd /srv/mpcharts && docker compose up -d --pull always"
   ```
   Verify the output shows the container was recreated and started.

3. **Verify container is running**: Run:
   ```bash
   docker --context ironside ps --filter name=mpcharts --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
   ```
   Confirm the container shows "Up" with a recent start time.

4. **Check cache warming**: Wait 10 seconds for the server to start, then check logs for cache warming completion:
   ```bash
   docker --context ironside logs mpcharts-mp-charts-1 --since 60s 2>&1 | grep -i "cache warm"
   ```
   Look for `Cache warming complete` or `all caches warmed` in the output. If not found yet, wait another 30 seconds and check again (cache warming can take up to 60 seconds depending on MP API response times).

5. **Report result**: Show the user:
   - CI run status and duration
   - Container status (up/down, uptime)
   - Cache warming result (success/failure, which caches warmed)

## Arguments

- `$ARGUMENTS` - Optional. If `--skip-ci` is passed, skip the CI check and proceed directly to pull/restart. Useful when you've already verified CI passed.

## Notes

- The Docker context `ironside` is configured at `ssh://ironside@192.168.4.81`
- The compose file is at `/srv/mpcharts/docker-compose.yml` on the remote host
- The image is `registry.gitlab.com/moodychurch/mp-charts:latest`
- Cache warming runs automatically on server start via `instrumentation.ts`
- Use `docker --context ironside` for inspection commands but `ssh ironside@192.168.4.81` for compose commands (compose needs the local file path)
