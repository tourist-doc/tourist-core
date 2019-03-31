# Error Cases

As of now this document is *proscriptive* rather than *descriptive*; it
describes the way we would like the library to behave, not necessarily how it
does behave.

Method | Error Case | Library Behavior | Extension Behavior
- **Tour File Manipulation**
  - `init` (no failure cases)
  - `add`
    - No known repository.
    - Mismatched repository versions.
    - Invalid location (file does not exist, or line not in file).
  - `remove`
    - Index out of bounds.
  - `edit`
    - Index out of bounds.
  - `move`
    - Not in a known repository.
    - Invalid location (file does not exist, or line not in file).
    - Index out of bounds.
    - Mismatched repository versions.
  - `resolve`
    - `check` failed.
  - TODO `check`
  - `refresh`
    - `check` failed.
  - `scramble`
    - One or more indices out of bounds.

- **Tour File IO**
  - `serializeTourFile` (no error cases)
  - `deserializeTourFile`
    - Invalid JSON string.

- **Tourist State Management**
  - `mapConfig` (no error cases)
  - `unmapConfig` (no error cases)
  - `dumpConfig` (no error cases)

- **Tourist State IO**
  - `serialize`
  - `deserialize`
    - Invalid JSON string.
