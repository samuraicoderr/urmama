SHELL := /usr/bin/env bash

# Auto-load .env for make targets (if present)
ifneq (,$(wildcard .env))
include .env
export
endif

.PHONY: help
help:
	@echo "urmama build & release tasks"
	@echo ""
	@echo "Setup"
	@echo "  make env-init             - Create .env from .env.example (first-time setup)"
	@echo "  make check-node           - Verify Node.js availability"
	@echo ""
	@echo "Development & Test"
	@echo "  make test                 - Run unit and integration tests"
	@echo ""
	@echo "Publishing to NPM"
	@echo "  make push-update          - Publish patch release (alias for publish-update)"
	@echo "  make publish-update       - Bump patch version and publish to npm"
	@echo "  make publish-update-minor - Bump minor version and publish to npm"
	@echo "  make publish-update-major - Bump major version and publish to npm"

.PHONY: check-node
check-node:
	@node -v

.PHONY: env-init
env-init:
	@if [[ -f .env ]]; then echo ".env already exists"; exit 0; fi
	@if [[ ! -f .env.example ]]; then echo ".env.example not found"; exit 1; fi
	@cp .env.example .env
	@echo "Created .env from .env.example"
	@echo "Now edit .env and set NPM_PUBLISH_KEY."

.PHONY: test
test:
	@node tests/urmama.test.js
	@node tests/integration.js

.PHONY: publish
publish:
	@set -euo pipefail; \
	token="$${NPM_PUBLISH_KEY:-}"; \
	if [[ -z "$$token" ]]; then \
	  read -rsp "Enter NPM publish token: " token; echo; \
	fi; \
	if [[ -z "$$token" ]]; then \
	  echo "NPM publish token is required (set NPM_PUBLISH_KEY in .env or enter at prompt)."; \
	  exit 1; \
	fi; \
	tmp_npmrc="$$(mktemp)"; \
	trap 'rm -f "$$tmp_npmrc"' EXIT; \
	printf '//registry.npmjs.org/:_authToken=%s\n' "$$token" > "$$tmp_npmrc"; \
	printf 'always-auth=true\n' >> "$$tmp_npmrc"; \
	AUTHORIZED=1 NPM_CONFIG_USERCONFIG="$$tmp_npmrc" npm publish --access public

.PHONY: push-update
push-update: publish-update

.PHONY: publish-update
publish-update:
	@set -euo pipefail; \
	npm version patch --no-git-tag-version; \
	$(MAKE) publish

.PHONY: publish-update-minor
publish-update-minor:
	@set -euo pipefail; \
	npm version minor --no-git-tag-version; \
	$(MAKE) publish

.PHONY: publish-update-major
publish-update-major:
	@set -euo pipefail; \
	npm version major --no-git-tag-version; \
	$(MAKE) publish
