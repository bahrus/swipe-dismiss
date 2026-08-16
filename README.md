# swipe-dismiss [TODO]

One behavior that the hamburger menu / side drawer component requires to be complete is a swipe to dismiss behavior.  Implementing this behavior appears to be non trivial with the current web platform api as it stands.

The behavior could be useful not just to drawer components, [but a number of other scenarios as well](./Chats/Claude.md).

This package provides both an element enhancement / custom attribute, to apply the behavior to third party content, as well as a custom element feature for scenarios where the UI is controlled exclusively by one "owner."

[Ideally, it will be the same class, just different configuration integration artifacts, but that remains to be seen].

## Viewing Demos Locally

1. Install git
2. Fork/clone this repo
3. Install node.js
4. Open command window to folder where you cloned this repo
5. > git submodule add https://github.com/bahrus/types.git types
6. > git submodule update --init --recursive
7. > npm install
8. > npm run serve
9. Open http://localhost:8000/ in a modern browser

## Running Tests

```
> npm run test
```



