# Unit test structure template

```text
Feature: <function/class under test>

Case 1 - normal path:
  Given <precondition>
  When  <action>
  Then  <assertion>

Case 2 - boundary path:
  Given <boundary input>
  When  <action>
  Then  <boundary assertion>

Case 3 - exception path:
  Given <exceptional input>
  When  <action>
  Then  <exception assertion>
```

---

## L3 required depth fields

| Field | Requirement |
|------|------|
| Two coverage metrics | Line / branch coverage |
| Key paths | Key path list and coverage |
