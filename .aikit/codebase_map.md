# Codebase Map & Symbol Catalog 🗺️

> **AUTO-GENERATED & VERIFIED BY `scripts/update_knowledge_base.py`**
> This document provides an automated, up-to-date registry of all modules, classes, and exported functions across this repository.

---

## 📊 Codebase Metrics
- **Total Python Modules**: `6`
- **Total Classes**: `6`
- **Total Top-Level Functions**: `79`
- **Total Class Methods**: `97`
- **Total Source Lines**: `3834`

---

## 📦 Modules & Exported Symbols

### [`tests/test_profile.py`](tests/test_profile.py)
> *Regression tests for the AegeanWorks profile, site and licensing integrity.*

**Size**: `1843` lines (`86305` bytes)

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
**Size**: `48` lines (`1645` bytes)

**Classes:**
- `class LiveBuildDigestTests`
  - Method `.test_line_endings_do_not_change_the_digest()`
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

**Size**: `698` lines (`28128` bytes)

**Classes:**
- `class SyncError` - *A user-facing sync failure with a Why/Fix pair.*
  - Method `.__init__(what, why, fix)`

**Functions:**
- `def _git(source, *args)`
- `def _version(source, relative)`
- `def _digest(files, root)`
- `def _write_atomic(path, payload)`
- `def _copy_file(source, target)`
- `def _copy_runtime(source, target, entries)`
- `def _runtime_files(target)`
- `def _source_path(source, relative)` - *Resolve an index reference inside the source, or None when it escapes it.*
- `def _allowed_url(value)` - *Only the W3C SVG and XLink namespaces may be named as external URLs.*
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
