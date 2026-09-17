# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""Ensure full Miyar seed runs once after this patch is applied on migrate."""


def execute():
	from miyar.setup.seed import seed_all

	seed_all()
