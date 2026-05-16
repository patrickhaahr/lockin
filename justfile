set shell := ["bash", "-cu"]

default:
  @just --list

run:
  pnpm vite

build:
  just typecheck
  pnpm vite build

test:
  pnpm vitest run

fmt:
  oxfmt .

linter:
  oxlint --deny-warnings .

typecheck:
  oxlint --type-aware --type-check --deny-warnings .
  pnpm tsc --noEmit

check:
  just fmt
  just linter
  just typecheck
  just test
