# TechnoStore V17 Contracts

These schemas define the stable interfaces between the `v17` workflows and the model layer.

- `context.schema.json`: compact turn context returned by `TechnoStore_v17_context_builder`
- `router-output.schema.json`: route decision returned by `TechnoStore_v17_router`
- `responder-output.schema.json`: typed response payload returned by route-specific responders
- `validator-output.schema.json`: final approved or rejected payload returned by `TechnoStore_v17_validator`
- `state-delta.schema.json`: normalized state mutation payload shared by responders and the validator

Treat these files as internal API contracts. If a workflow changes one of them, that change should be reviewed like an interface change in a backend service.
