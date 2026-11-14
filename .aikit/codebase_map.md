# Codebase Map & Symbol Catalog 🗺️

> **AUTO-GENERATED & VERIFIED BY `scripts/update_knowledge_base.py`**
> This document catalogues Python modules, classes, and exported functions. See Map Coverage for any stack it does not index.

---

## 📊 Codebase Metrics
- **Total Python Modules**: `29`
- **Total Classes**: `41`
- **Total Top-Level Functions**: `166`
- **Total Class Methods**: `221`
- **Total Source Lines**: `6989`

## 🧭 Map Coverage
- **Indexed**: python (`29` module(s))
- **Not indexed by this map**: javascript (`185` file(s))

> Only Python symbols are catalogued. A language above is reported as not indexed, never as verified by this map.

---

## 📦 Modules & Exported Symbols

### [`tests/test_profile.py`](tests/test_profile.py)
> *Regression tests for the AegeanWorks profile, site and licensing integrity.*

**Size**: `2026` lines (`94757` bytes)

**Classes:**
- `class ProfileIntegrityTests` - *Guard the profile structure, links, voice and configuration.*
  - Method `.test_readme_exists_and_non_empty()`
  - Method `.test_readme_sections_present()`
  - Method `.test_readme_categories_are_title_cased()`
  - Method `.test_readme_speaks_as_the_company()`
  - Method `.test_brand_assets_are_present()`
  - Method `.test_funding_configuration()`
  - Method `.test_only_public_repositories_are_linked()`
  - Method `.test_readme_atlas_lists_every_public_repository()`
  - Method `.test_license_matches_the_aikit_family()`
  - Method `.test_site_entry_points_exist()`
  - Method `.test_project_dossier_page_is_wired()`
  - Method `.test_screenshot_viewer_is_in_page_and_keyboard_ready()`
  - Method `.test_live_apps_are_wired_and_current()`
  - Method `.test_editor_page_is_wired_and_synced()`
  - Method `.test_source_validator_covers_every_runtime_file()`
  - Method `.test_optional_live_source_can_be_absent()`
  - Method `._live_sync_module(name)`
  - Method `._live_fixture(root, archived)`
  - Method `._live_fixture_app()`
  - Method `.test_archived_live_source_is_retained_after_the_folder_moves()`
  - Method `.test_missing_unarchived_live_source_still_refuses()`
  - Method `.test_build_digest_is_stable_across_platforms()`
  - Method `.test_portfolio_cards_use_repository_logos()`
  - Method `.test_dossier_media_manifests_are_consistent()`
  - Method `.test_dossier_media_manifest_is_documented()`
  - Method `.test_site_is_self_contained()`
  - Method `.test_node_suites_are_esm()`
  - Method `.test_verifier_conveniences_are_wired()`
  - Method `.test_service_worker_shell_is_complete()`
  - Method `.test_trust_pages_are_published_and_linked()`
  - Method `.test_trust_pages_share_the_full_legal_footer()`
  - Method `.test_privacy_table_labels_its_cells_for_narrow_screens()`
  - Method `.test_security_txt_is_valid()`
  - Method `.test_atlas_search_topic_sort_and_url_state()`
  - Method `.test_portfolio_scripts_are_cache_coherent()` - *A new Status control must never run against an older cached app.js.*
  - Method `.test_live_atlas_is_wired_to_the_github_api()`
  - Method `.test_site_lists_every_public_repository_once()`
  - Method `.test_site_filters_are_topics_only()`
  - Method `.test_project_cards_carry_an_immutable_repository_id()`
  - Method `.test_project_cards_show_language_license_and_recency()`
  - Method `.test_featured_work_cards_carry_an_immutable_repository_id()`
  - Method `.test_site_licensing_copy_is_current()`
  - Method `.test_licensing_copy_names_the_agpl_transition()`
  - Method `.test_project_count_names_project_repositories()`
  - Method `.test_site_license_tiers_link_to_canonical_texts()`
  - Method `.test_external_links_are_safe()`
  - Method `.test_site_accessibility_basics()`
  - Method `.test_site_works_without_javascript()`
  - Method `.test_site_degrades_open_when_the_script_fails()`
  - Method `.test_hero_chip_is_exposed_to_assistive_tech()`
  - Method `.test_social_metadata_is_complete()`
  - Method `.test_structured_data_describes_the_organization()`
  - Method `.test_topic_filter_region_controls_the_project_grid()`
  - Method `.test_anchor_navigation_clears_the_sticky_header()`
  - Method `.test_discovery_files()`
  - Method `.test_social_image_has_the_expected_dimensions()`
  - Method `.test_not_found_page_is_noindexed()`
  - Method `.test_web_app_manifest()`
  - Method `.test_verify_page_has_a_no_javascript_path()`
  - Method `.test_verifier_caps_fetches_before_reading()`
  - Method `.test_verifier_checks_types_before_canonicalization()`
  - Method `.test_verifier_canonical_numbers_and_del_are_bounded()`
  - Method `.test_verifier_explains_a_disabled_browser_crypto_path()`
  - Method `.test_icon_dimensions()`
  - Method `.test_mobile_orbit_labels_are_large_enough()`
  - Method `.test_print_media_reveals_every_section()`
  - Method `.test_mobile_menu_is_opaque_and_single_github_entry()`
  - Method `.test_mobile_scrim_absorbs_taps()`
  - Method `.test_open_menu_makes_the_page_behind_inert()`
  - Method `.test_open_menu_contains_keyboard_focus()`
  - Method `.test_header_links_close_the_open_menu()`
  - Method `.test_license_identifiers_do_not_break_at_hyphens()`
  - Method `.test_site_recovers_when_app_js_fails()`
  - Method `.test_noscript_nav_is_inside_the_sticky_header()`
  - Method `.test_orbit_animation_is_centred()`
  - Method `.test_hero_mark_is_centred_in_its_square()`
  - Method `.test_aikit_memory_intact()`
  - Method `.test_ci_workflow_runs_the_suite()`
  - Method `.test_ci_workflow_runs_the_node_parity_suite()`
  - Method `.test_snapshot_covers_every_public_repository()`
  - Method `.test_site_metadata_matches_the_github_profile()`
  - Method `.test_project_cards_match_github_metadata()`
  - Method `.test_readme_atlas_matches_github_metadata()`
  - Method `.test_verify_page_is_linked_and_complete()`
  - Method `.test_verify_page_is_self_contained()`
  - Method `.test_verifier_reads_only_the_canonical_registry()`
  - Method `.test_verifier_cannot_check_signatures()`
  - Method `.test_verifier_never_uploads_the_certificate()`
  - Method `.test_verifier_form_cannot_natively_submit()`
  - Method `.test_verifier_uses_text_nodes_only()`
  - Method `.test_site_ships_no_signing_material()`
  - Method `.test_verification_vector_is_pinned()`
  - Method `.test_sitemap_lists_the_verify_page()`
  - Method `.test_external_links_are_safe_on_every_page()`
  - Method `.test_pages_send_a_content_security_policy()`

**Functions:**
- `def read_readme()`
- `def read_site()`
- `def read_verify()`
- `def read_license_families()` - *The site's license ledger is the single source of truth for family codes.*
- `def read_metadata()`

---

### [`tests/test_social_browser.py`](tests/test_social_browser.py)
> *Tests for the browser publishing path (tools/social/browser_post.py).*

**Size**: `364` lines (`16797` bytes)

**Classes:**
- `class FakePage` - *Minimal page adapter double: records calls, never clicks by itself.*
  - Method `.__init__(echo_ok, confirmed, found_tweet, thread_has_link)`
  - Method `.find_tweet(snippet)`
  - Method `.open_tweet(url)`
  - Method `.thread_contains(text)`
  - Method `.click_reply()`
  - Method `.goto(url)`
  - Method `.fill_composer(text)`
  - Method `.attach_media(paths)`
  - Method `.click_post()`
  - Method `.confirm_posted()`
- `class BrowserPostTests`
  - Method `.setUp()`
  - Method `.tearDown()`
  - Method `.test_prepare_writes_exact_package()`
  - Method `.test_prepare_needs_approval()`
  - Method `.test_prepare_checklist_names_metadata_not_burned_footer()`
  - Method `.test_drive_compose_only_by_default()`
  - Method `.test_drive_click_needs_env_flag()`
  - Method `.test_drive_needs_approval()`
  - Method `.test_drive_rejects_mutated_echo()`
  - Method `.test_drive_unconfirmed_click_claims_nothing()`
  - Method `.test_drive_missing_visual_file_blocked()`
  - Method `.test_drive_attaches_multiple_visuals()`
  - Method `.test_drive_rejects_duplicate_bytes()`
- `class LinkReplyTests`
  - Method `.test_reply_posts_bare_repo_url()`
  - Method `.test_reply_skipped_when_duplicate()`
  - Method `.test_reply_needs_parent_on_profile()`
  - Method `.test_reply_needs_approval()`
  - Method `.test_reply_is_bare_url_only()`
  - Method `.test_compose_only_reports_reply_for_manual()`
  - Method `.test_drive_records_posted_repo()`

**Functions:**
- `def approved_draft(state, text)`

---

### [`tests/test_social_manager.py`](tests/test_social_manager.py)
> *Tests for the AegeanWorks social manager (tools/social/).*

**Size**: `441` lines (`20291` bytes)

**Classes:**
- `class DisclosureTests`
  - Method `.test_copy_pinned()`
  - Method `.test_no_boilerplate_in_post_facing_copy()`
  - Method `.test_built_draft_carries_no_boilerplate()`
  - Method `.test_marker_empty_is_identity()`
- `class TopicGateTests`
  - Method `.test_allowlist_matches_public_repos()`
  - Method `.test_off_topic_blocked()`
  - Method `.test_draft_blocks_off_topic()`
- `class EvidenceTests`
  - Method `.test_bad_commit_blocked()`
  - Method `.test_missing_data_file_blocked()`
  - Method `.test_red_suite_blocked()`
- `class MediaPipelineTests`
  - Method `.test_capture_records_provenance()`
  - Method `.test_recycled_screenshot_blocked()`
  - Method `.test_capture_bad_commit_blocked()`
  - Method `.test_chart_requires_units()`
  - Method `.test_chart_blocks_cherry_pick()`
  - Method `.test_chart_blocks_truncated_axis()`
  - Method `.test_chart_deterministic()`
  - Method `.test_compose_carries_provenance_without_pixel_watermark()`
  - Method `.test_compose_blocks_missing_provenance()`
  - Method `.test_provenance_verify()`
- `class DraftQueueTests`
  - Method `.test_text_only_visual_subject_blocked()`
  - Method `.test_provenance_free_visual_blocked()`
  - Method `.test_draft_unapproved_by_default()`
  - Method `.test_publish_blocks_unapproved()`
  - Method `.test_publish_mock_roundtrip_and_idempotency()`
  - Method `.test_live_blocked_without_flag()`
  - Method `.test_rephrased_repost_blocked()`
  - Method `.test_exact_duplicate_blocked()`
- `class CadenceTests`
  - Method `.test_caps_enforced()`
  - Method `.test_three_daily_slots_pass()`
- `class ExplainerGateTests`
  - Method `.test_naked_name_drop_blocked()`
  - Method `.test_explainer_missing_from_text_blocked()`
  - Method `.test_notice_needs_no_explainer()`
  - Method `.test_overlong_post_blocked()`
- `class ShotsTests`
  - Method `.test_shots_needs_posted_intro_first()`
  - Method `.test_shots_caption_must_match_count()`
  - Method `.test_shots_post_builds_without_explainer()`
  - Method `.test_shots_rejects_dossier_card_as_screenshot()`
- `class ProfileTests`
  - Method `.test_profile_change_needs_approval()`
- `class ContextTests`
  - Method `.test_context_from_repo_sources()`
  - Method `.test_context_off_topic_blocked()`
- `class SecretBoundaryTests`
  - Method `.test_no_credential_values_in_module_or_tests()`
  - Method `.test_credentials_env_only()`
- `class SiteDisclosureTests`
  - Method `.test_site_notice_on_every_shared_footer()`
  - Method `.test_privacy_names_ai_operation()`

**Functions:**
- `def visual_fixture(**over)`
- `def draft_record(state, text, repo, explainer)`

---

### [`tests/test_social_review.py`](tests/test_social_review.py)
> *Tests for the aesthetic review gate (tools/social/media_review.py).*

**Size**: `280` lines (`11506` bytes)

**Classes:**
- `class FakePage`
  - Method `.__init__(confirmed)`
  - Method `.goto(url)`
  - Method `.fill_composer(text)`
  - Method `.attach_media(paths)`
  - Method `.click_post()`
  - Method `.confirm_posted()`
- `class FakeHTTPResponse`
  - Method `.__init__(payload)`
  - Method `.__enter__()`
  - Method `.__exit__(*args)`
  - Method `.read()`
- `class ReviewTests`
  - Method `.test_sharp_passes()`
  - Method `.test_blurry_blocked()`
  - Method `.test_tiny_blocked()`
  - Method `.test_non_raster_blocked()`
  - Method `.test_distortion_blocked()`
  - Method `.test_proportional_ok()`
  - Method `.test_duplicate_bytes_rejected()`
  - Method `.test_pluggable_reviewer()`
- `class DriveReviewTests`
  - Method `.setUp()`
  - Method `.tearDown()`
  - Method `.test_drive_blocks_ugly_attachment()`
  - Method `.test_drive_attaches_reviewed_visual()`
- `class MetaImageTests`
  - Method `.test_key_required()`
  - Method `.test_unauthorized_maps_to_key_error()`
  - Method `.test_generate_decodes_payload()`
  - Method `.test_ai_review_parses_verdict()`
  - Method `.test_drive_ai_flag_blocks_click()`
  - Method `.test_drive_ai_pass_records_verdict()`

**Functions:**
- `def make_png(path, width, height, blur)`
- `def visual_for(src)`

---

### [`tests/test_sync_editor_digest.py`](tests/test_sync_editor_digest.py)
**Size**: `57` lines (`2114` bytes)

**Classes:**
- `class EditorBuildDigestTests`
  - Method `.test_line_endings_do_not_change_the_digest()`
  - Method `.test_binary_files_are_hashed_byte_for_byte()`
  - Method `.test_source_hash_matches_across_line_endings()`

**Functions:**
- `def load_sync_tool()`

---

### [`tests/test_sync_live_digest.py`](tests/test_sync_live_digest.py)
**Size**: `112` lines (`4334` bytes)

**Classes:**
- `class LiveBuildDigestTests`
  - Method `.test_line_endings_do_not_change_the_digest()`
  - Method `.test_live_file_override_replaces_a_runtime_file()`
  - Method `.test_binary_files_are_hashed_byte_for_byte()`

**Functions:**
- `def load_sync_tool()`

---

### [`tools/build_dossier_media.py`](tools/build_dossier_media.py)
> *Build and verify the dossier media (logo, social preview, screenshots).*

**Size**: `973` lines (`38216` bytes)

**Classes:**
- `class MediaError`

**Functions:**
- `def image_facts(data)` - *Return (format, width, height) without decoding the pixels.*
- `def _webp_size(data)`
- `def _jpeg_size(data)`
- `def _svg_size(data)`
- `def digest(data)`
- `def _pillow()`
- `def optimize(data, kind)`
- `def _font(size, bold)`
- `def _wrap(draw, text, font, width)`
- `def fallback_card(repo, kind)` - *Draw a branded card for a repository that ships no assets/ images.*
- `def fetch(url)`
- `def resolve_commit(name, branch)`
- `def raw_url(name, ref, path)`
- `def load_repos()`
- `def previous_local_logo(folder, manifest)` - *The approved logo art already committed for this repository, if any.*
- `def exact_path(relative)` - *True when every segment matches on-disk case, which Windows would hide.*
- `def manifest_path(name)` - *Existing manifests keep their original file name, which may differ in case.*
- `def media_folder(name, manifest)` - *Reuse the folder an existing logo points at so paths never churn.*
- `def read_manifest(name)`
- `def clean_text(value, name, date)` - *Strip local filesystem paths from captions; manifests are public.*
- `def sanitize_manifest(manifest, name)`
- `def write_atomic(path, payload)`
- `def write_logo_index()` - *One small file the portfolio reads to put real logos on the cards.*
- `def write_manifest(name, manifest)`
- `def asset_entry(folder, name, kind, payload, fmt, width, height, commit, source, generated)`
- `def fetch_asset(name, ref, candidates)`
- `def build_repo(repo, force)`
- `def api_json(url)`
- `def discover_screenshots(name, commit)` - *List capture files committed under a repository's screenshot folders.*
- `def optimize_shot(data)`
- `def add_screenshots(repo, commit)`
- `def command_fetch(args)`
- `def command_analyze(args)`
- `def command_check(args)`
- `def humanize(value)`
- `def safe_slug(value)`
- `def command_ingest(args)`
- `def main(argv)`

---

### [`tools/social/__init__.py`](tools/social/__init__.py)
> *AegeanWorks social manager: posts about the works of AegeanWorks on X.*

**Size**: `10` lines (`319` bytes)

---

### [`tools/social/browser_post.py`](tools/social/browser_post.py)
> *Browser publishing path: no X API, no keys, no per-post cost.*

**Size**: `354` lines (`15679` bytes)

**Classes:**
- `class BrowserError` - *Raised when the browser path is unsafe or the page misbehaves.*
- `class PlaywrightPage` - *Real adapter over a Playwright page on x.com (imported lazily).*
  - Method `.__init__(page)`
  - Method `.goto(url)`
  - Method `._first(test_ids)`
  - Method `.fill_composer(text)`
  - Method `.attach_media(paths)`
  - Method `.confirm_posted(timeout_ms)` - *True only when X shows the sent confirmation; never assume.*
  - Method `.find_tweet(snippet)` - *Return the first status URL on the profile containing the snippet.*
  - Method `.open_tweet(path)`
  - Method `.thread_contains(text)`
  - Method `.click_reply()`
  - Method `.click_post()`

**Functions:**
- `def reply_url_for(repo)` - *The link reply is exactly this URL — no commit, no date, no prose.*
- `def _record(state_dir, draft_id)`
- `def prepare(draft_id, out_dir, state_dir)` - *Write the publish package; returns the package manifest (never posts).*
- `def drive(page, draft_id, state_dir, final_click, link_reply)` - *Compose the approved draft in the browser; clicks Post only if armed.*
- `def post_link_reply(draft_id, page, state_dir, final_click)` - *Post the deterministic repo-URL reply under the draft's live post.*

---

### [`tools/social/context.py`](tools/social/context.py)
> *Post context built only from in-repo sources (atlas, dossiers, live builds).*

**Size**: `39` lines (`1548` bytes)

**Functions:**
- `def _read_json(relative)`
- `def load_context(repo)` - *Assemble the verified context for a repo; raises on off-topic.*

---

### [`tools/social/disclosure.py`](tools/social/disclosure.py)
> *Disclosure copy loader + marker application (un-droppable by construction).*

**Size**: `54` lines (`1536` bytes)

**Functions:**
- `def load_disclosure()` - *Read the reviewed disclosure copy.*
- `def bio_text()` - *Exact X bio stating AI operation.*
- `def site_notice()` - *Exact website AI-run notice.*
- `def post_marker()` - *Per-post marker. Empty by owner decision: posts carry no boilerplate;*
- `def ai_mark()` - *Made-by-AI mark burned into generated infographics.*
- `def apply_marker(text)` - *Append the automation marker unless already present. Identity when empty.*
- `def has_marker(text)` - *True when the automation marker is present (vacuous when empty).*

---

### [`tools/social/draft.py`](tools/social/draft.py)
> *Draft builder: the single choke point (topic -> evidence -> media -> marker -> spam).*

**Size**: `168` lines (`7196` bytes)

**Classes:**
- `class DraftError` - *Raised when a draft cannot be built.*

**Functions:**
- `def _squash(text)`
- `def require_explainer(text, explainer)` - *Enforce R4: the post must say what the project is, in its own words.*
- `def require_posted_first(repo, state_dir)` - *Enforce R8: screenshot drops only build on an already-posted project.*
- `def require_shots_caption(text, name, visual)` - *Enforce the drop caption: singular for one shot, plural for 2-3.*
- `def require_fresh_shots(repo, visual)` - *Enforce that shots are captures, not dossier cards passed off as screenshots.*
- `def build_post(repo, text, kind, commit, data_file, suite_ok, visual, run_id, date, state_dir, existing_texts, explainer)` - *Build, gate and queue a draft; returns the queue record (unapproved).*

---

### [`tools/social/evidence.py`](tools/social/evidence.py)
> *Verified-state gate: every post traces to a verified repo state.*

**Size**: `55` lines (`1905` bytes)

**Classes:**
- `class UnverifiedError` - *Raised when evidence does not support a post.*

**Functions:**
- `def check_commit(commit)` - *Validate a 7-40 hex commit SHA.*
- `def check_data_file(relative)` - *Validate that the cited data file exists inside the repo.*
- `def require_evidence(repo, commit, data_file, suite_ok)` - *Return the evidence record or raise UnverifiedError.*

---

### [`tools/social/media_capture.py`](tools/social/media_capture.py)
> *Fresh screenshot capture with ingest-equivalent provenance semantics.*

**Size**: `111` lines (`4130` bytes)

**Classes:**
- `class CaptureError` - *Raised when a capture cannot prove what it shows.*

**Functions:**
- `def digest(data)` - *SHA-256 digest in the house format.*
- `def image_size(data)` - *Return (width, height) for PNG/JPEG/WebP without decoding pixels.*
- `def record_capture(raw, repo, commit, viewport, known_digests, taken_at)` - *Validate raw pixels and return the capture manifest entry (no file I/O).*
- `def save_capture(raw, dest, entry)` - *Write pixels atomically and fill in src; mirrors the house writer.*

---

### [`tools/social/media_chart.py`](tools/social/media_chart.py)
> *Plotted data from measured numbers (stdlib SVG; Pillow PNG optional).*

**Size**: `116` lines (`4720` bytes)

**Classes:**
- `class ChartError` - *Raised when a chart would mislead.*

**Functions:**
- `def load_series(data_file, rows)` - *Assert rows match the cited series file row-for-row (no cherry-pick).*
- `def render_svg(title, unit, rows, run_id, commit, broken_axis)` - *Render a deterministic bar chart SVG with provenance baked in.*
- `def svg_digest(svg)` - *Deterministic digest so audits can re-plot and compare.*
- `def render_png(svg, dest, title)` - *Rasterize the chart deterministically via Pillow (maintenance step).*

---

### [`tools/social/media_compose.py`](tools/social/media_compose.py)
> *Infographic composer: title + numbers, clean pixels.*

**Size**: `54` lines (`1932` bytes)

**Functions:**
- `def compose_svg(title, lines, run_id, commit, data_file, date, ai_mark)` - *Compose the infographic SVG; raises if any provenance slot is empty.*
- `def svg_digest(svg)` - *Deterministic digest for audit comparison.*

---

### [`tools/social/media_review.py`](tools/social/media_review.py)
> *Aesthetic review: no ugly visual ships through automation.*

**Size**: `120` lines (`4435` bytes)

**Classes:**
- `class ReviewError` - *Raised when a visual fails aesthetic review.*

**Functions:**
- `def assert_no_duplicates(paths)` - *Refuse to attach the same bytes twice; similar-looking shots are the human's call.*
- `def register_reviewer(name, fn)` - *Add an extra judge (e.g. a vision model) run after the heuristics.*
- `def edge_energy(raw)` - *Mean FIND_EDGES response on a downscaled luminance copy.*
- `def assert_no_distortion(src_size, dst_size)` - *Fail when a resize stretches content (crop-to-fill instead).*
- `def review_bytes(raw, kind)` - *Review pixels; return the report or raise ReviewError.*
- `def review_file(path)` - *Review a visual file by path.*

---

### [`tools/social/meta_image.py`](tools/social/meta_image.py)
> *Meta Model API wiring: AI image generation + AI aesthetic review.*

**Size**: `127` lines (`5000` bytes)

**Classes:**
- `class MetaImageError` - *Raised for key, network or API failures (key never included).*

**Functions:**
- `def _key()`
- `def _post(path, payload)`
- `def generate_image(prompt, size)` - *Generate one PNG image; returns raw bytes.*
- `def ai_review(image_bytes)` - *Vision verdict: 'pass' or 'flagged: <reason>' (raises without a key).*

---

### [`tools/social/profile.py`](tools/social/profile.py)
> *Profile maintenance: bio + site-notice proposals, approval-gated like posts.*

**Size**: `25` lines (`1013` bytes)

**Functions:**
- `def propose_bio()` - *Return the reviewed bio proposal (apply on X by hand).*
- `def propose_site_notice()` - *Return the reviewed site-notice proposal (applied to the shared footer).*
- `def apply_profile_change(change, record)` - *Apply a bio/site-notice change only with explicit human approval.*

---

### [`tools/social/provenance.py`](tools/social/provenance.py)
> *Provenance stamp + sidecar + verify (re-capture / re-plot audit).*

**Size**: `65` lines (`2303` bytes)

**Classes:**
- `class ProvenanceError` - *Raised when a visual cannot prove its run.*

**Functions:**
- `def stamp(run_id, commit, data_file, date)` - *Return the provenance record string for visual metadata and sidecar (pixels stay clean).*
- `def sidecar(src, digest_value, run_id, commit, data_file, produced_at)` - *Return the visual sidecar record.*
- `def verify_digest(payload, expected)` - *Raise unless the payload digest equals the recorded digest.*
- `def write_sidecar(path, record)` - *Write the sidecar JSON atomically.*

---

### [`tools/social/publish.py`](tools/social/publish.py)
> *Publishing: approval-gated, marker-asserted, topic re-checked, idempotent.*

**Size**: `41` lines (`1699` bytes)

**Classes:**
- `class PublishError` - *Raised when publishing is blocked.*

**Functions:**
- `def publish(draft_id, state_dir, transport, published_hashes)` - *Publish a queued draft; default transport is the dry-run mock.*

---

### [`tools/social/published.py`](tools/social/published.py)
> *Posted-post log: which repos already have a live post.*

**Size**: `67` lines (`2057` bytes)

**Functions:**
- `def _path(state_dir)`
- `def _read(state_dir)`
- `def _write(state_dir, data)`
- `def record(state_dir, draft_id, repo, text, kind)` - *Record a posted tweet; idempotent per draft id.*
- `def has_repo_post(state_dir, repo)` - *True when the repo already has at least one recorded live post.*

---

### [`tools/social/queue.py`](tools/social/queue.py)
> *File-backed draft queue. Drafts are unapproved by default; approval is explicit.*

**Size**: `99` lines (`3426` bytes)

**Classes:**
- `class QueueError` - *Raised for unknown drafts or bad approvals.*

**Functions:**
- `def _state_dir(state_dir)`
- `def _path(state_dir)`
- `def _read(state_dir)`
- `def _write(state_dir, data)`
- `def add_draft(draft, state_dir)` - *Store a draft as unapproved and return it with its id.*
- `def approve(draft_id, approver, state_dir)` - *Mark a draft human-approved; approver name is required.*
- `def get(draft_id, state_dir)` - *Return one draft record or raise.*
- `def require_approval(record)` - *Raise unless the record carries explicit human approval.*

---

### [`tools/social/secrets.py`](tools/social/secrets.py)
> *Environment-only credential loader. No defaults, no logging, no disk reads.*

**Size**: `29` lines (`924` bytes)

**Classes:**
- `class MissingCredentialsError` - *Raised when live credentials are absent.*

**Functions:**
- `def load_x_credentials()` - *Return live X credentials from the environment or raise.*
- `def live_enabled()` - *True only when the explicit live flag is set.*

---

### [`tools/social/spam_guard.py`](tools/social/spam_guard.py)
> *Spam guards: cadence caps, exact-hash duplicates, similarity near-dupes.*

**Size**: `85` lines (`3049` bytes)

**Functions:**
- `def load_cadence()` - *Read the reviewed cadence rules.*
- `def normalize(text)` - *Lowercase, strip the automation marker, collapse whitespace.*
- `def content_hash(text)` - *Exact-duplicate identity (marker-insensitive).*
- `def _tokens(text)`
- `def jaccard(left, right)` - *Token Jaccard similarity in [0, 1].*
- `def levenshtein_ratio(left, right)` - *Normalized similarity from edit distance (bounded inputs only).*
- `def is_near_duplicate(left, right, rules)` - *True when a rephrased repost would slip past exact hashing.*
- `def cadence_ok(published_at, now, rules)` - *Enforce max/day, min gap, quiet hours and max/week.*

---

### [`tools/social/topic_gate.py`](tools/social/topic_gate.py)
> *On-topic gate: a post is publishable only if it is about an AegeanWorks work.*

**Size**: `43` lines (`1535` bytes)

**Classes:**
- `class OffTopicError` - *Raised when a subject is not an AegeanWorks work.*

**Functions:**
- `def load_works()` - *Return the lower-cased set of catalogue repository names.*
- `def is_on_topic(subject)` - *True when the subject names an AegeanWorks work (case-insensitive).*
- `def require_on_topic(subject)` - *Return the canonical subject or raise OffTopicError.*

---

### [`tools/social/x_client.py`](tools/social/x_client.py)
> *Thin X API client: mock transport by default, live only if explicitly enabled.*

**Size**: `41` lines (`1664` bytes)

**Classes:**
- `class MockTransport` - *Dry-run transport: records posts, publishes nothing.*
  - Method `.__init__()`
  - Method `.post(text, idempotency_key, media)` - *Record a post and return a mock receipt.*
- `class LiveTransport` - *Real transport placeholder: enabled only with env credentials + live flag.*
  - Method `.__init__(credentials)`
  - Method `.post(text, idempotency_key, media)` - *Live posting is implemented when a human approves a live test.*

**Functions:**
- `def idempotency_key(text, visual_digest)` - *Idempotency key binding text to its visual.*

---

### [`tools/sync_editor.py`](tools/sync_editor.py)
> *Vendor the Palette image editor into the AegeanWorks site.*

**Size**: `215` lines (`8012` bytes)

**Classes:**
- `class SyncError` - *A user-facing sync failure with a Why/Fix pair.*
  - Method `.__init__(what, why, fix)`

**Functions:**
- `def _payload(path)`
- `def _digest(path)`
- `def _source_files(source)`
- `def _source_hash(files, source)`
- `def _manifest(source, files)`
- `def _write_atomic(path, payload)`
- `def command_write(source)`
- `def _load_manifest()`
- `def command_check(source)`
- `def main(argv)`

---

### [`tools/sync_live_apps.py`](tools/sync_live_apps.py)
> *Sync the live browser apps and their catalog.*

**Size**: `818` lines (`33467` bytes)

**Classes:**
- `class SyncError` - *A user-facing sync failure with a Why/Fix pair.*
  - Method `.__init__(what, why, fix)`

**Functions:**
- `def _git(source, *args)`
- `def _version(source, relative)`
- `def _digest(files, root)`
- `def _write_atomic(path, payload)`
- `def _copy_file(source, target)`
- `def _safe_build_path(value)`
- `def _copy_overrides(source, target, overrides)` - *Replace or add named build files from a source-relative path.*
- `def _copy_runtime(source, target, entries)`
- `def _runtime_files(target)`
- `def _source_path(source, relative)` - *Resolve an index reference inside the source, or None when it escapes it.*
- `def _allowed_url(value)` - *Only the W3C SVG and XLink namespaces may be named as external URLs.*
- `def source_directory(game, source_root)` - *The live source checkout, or its archived copy after ``aikit archive`` moved it.*
- `def source_is_archived(source)` - *Whether the source lives under ``archive/`` or records an archived project.*
- `def validate_source(game, source_root)` - *Check the static contract the website relies on before copying a build.*
- `def source_problems(source_root)`
- `def _manifest_entry(slug)` - *The previous manifest entry for one game, or an empty mapping.*
- `def _build_path_ok(slug, relative)`
- `def _retained_paths(game, base, current)` - *The current build plus the predecessors the previous catalog recorded.*
- `def _browser_entry(game, source_root)`
- `def _runtime_entry_files(root, entries)`
- `def _local_entry(game, source_root)` - *Describe a build that is already vendored inside docs/ (no copy).*
- `def build_manifest(source_root)`
- `def _read_manifest()`
- `def check_manifest()`
- `def command_write(source_root)`
- `def command_check_source(source_root)`
- `def command_check()`
- `def main(argv)`

---
