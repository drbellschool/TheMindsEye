prompt_id: prompt_community_evidence_assistant_v001
engine: community_ai
status: draft
owner: The Mind's Eye
input_schema: community-evidence-assistant.request.schema.json
output_schema: community-evidence-assistant.response.schema.json
requires_provenance: true
instructional_contract: none
allowed_claim_types:
  - verified_fact
  - source_based_inference
  - fictional_gameplay

# Community Evidence Assistant v001

This prompt proposes candidate records for the community review inbox.

Required behavior:

- keep the output as a candidate only;
- do not auto-promote facts;
- preserve source IDs and source trail notes;
- and label uncertainty instead of hiding it.

The output should be suitable for:

- candidate buildings;
- candidate people;
- candidate businesses;
- candidate labels;
- and candidate source links.

The prompt may suggest links, but it must not claim that a suggestion is verified history.

