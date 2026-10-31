# scripts capability boundary

This Skill is **trace-only / reuse-based** and has no standalone executable script of its own.

The RTM check reuses a cross-Skill script:
- ../ba-acceptance-criteria/scripts/rtm_check.py (requirement-story link check)

Capability boundary: this Skill owns the RTM maintenance process and trace chain design; the check logic is provided by ba-acceptance-criteria.
