# Error codes:
- 0-99    : Operation input error
  - 0, Index out of bounds.
  - 1, One or more indices out of bounds.
- 100-199 : Input validation error
  - 100, Invalid location. Could not read {file}.
  - 101, Invalid location. No line {line} in {file}.
- 200-299 : External state error
  - 200, Repository {repo} is not mapped to a path.
  - 201, Path {path} is not mapped as a repository.
  - 202, Could not get current version for repository {repo}.
  - 203, Mismatched versions. Repository {repo} is checked out to the wrong
         version.
- 300-399 : Internal state error
  - 300, No version for repository {repo}.
- 400-499 : Serialization/deserialization error
  - 400, Invalid JSON string.
  - 401, Object is not a valid TourFile.

# Error Cases

- **Tour File Manipulation**
  - `init` (no failure cases)
  - `add`
    - 100, Invalid location. Could not read {file}.
    - 101, Invalid location. No line {line} in {file}.
    - 200, Repository {repo} is not mapped to a path.
    - 201, Path {path} is not mapped as a repository.
    - 202, Could not get current version for repository {repo}.
    - 203, Mismatched versions. Repository {repo} is checked out to the wrong
           version.
  - `remove`
    - 0, Index out of bounds.
  - `edit`
    - 0, Index out of bounds.
  - `move`
    - 0, Index out of bounds.
    - 100, Invalid location. Could not read {file}.
    - 101, Invalid location. No line {line} in {file}.
    - 201, Path {path} is not mapped as a repository.
    - 202, Could not get current version for repository {repo}.
    - 203, Mismatched versions. Repository {repo} is checked out to the wrong
           version.
  - `resolve`
    - 200, Repository {repo} is not mapped to a path.
  - `check`
    - 100, Invalid location. Could not read {file}.
    - 101, Invalid location. No line {line} in {file}.
    - 200, Repository {repo} is not mapped to a path.
    - 203, Mismatched versions. Repository {repo} is checked out to the wrong
           version.
    - 300, No version for repository {repo}.
  - `refresh`
    - 200, Repository {repo} is not mapped to a path.
    - 300, No version for repository {repo}.
  - `scramble`
    - 1, One or more indices out of bounds.

- **Tour File IO**
  - `serializeTourFile` (no error cases)
  - `deserializeTourFile`
    - 400, Invalid JSON string.
    - 401, Object is not a valid TourFile.

- **Tourist State Management**
  - `mapConfig` (no error cases)
  - `unmapConfig` (no error cases)
  - `dumpConfig` (no error cases)

- **Tourist State IO**
  - `serialize`
  - `deserialize`
    - 400, Invalid JSON string.
