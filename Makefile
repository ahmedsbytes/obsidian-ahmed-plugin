SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

.PHONY: all validate lint format-check typecheck test test-all clean

all: test-all

validate: lint format-check typecheck

lint:
	npm run lint

format-check:
	npm run format:check

typecheck:
	npm run typecheck

test:
	npm test

test-all: validate test

clean:
	node -e 'for (const path of ["coverage", ".cache"]) require("node:fs").rmSync(path, { recursive: true, force: true })'
