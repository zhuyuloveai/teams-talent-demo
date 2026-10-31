# Verified Modules and UI Development Reference

The following are source-code facts from the repository `workspace/carddemo-java-1025`; the verified files and SHA-256 values are in `provenance.json` of the same artifact. They are implementation references and do not mean this requirement has been developed.

## Actual frontend technology and entry points

- `services/web-ui/src/main/resources/static/app.js` is a framework-free browser JavaScript single-page app, not a React/TypeScript page. `route()` uses hash routing; `#/cards/<cardNumber>` calls `pageCardDetail(cardNumber)`.
- `pageCardDetail` reads the card details through `api('/api/v1/cards/'+encodeURIComponent(cardNumber))` and calls `shell` to render the title and content. The new benefit entry should be designed within these details; do not replace the card maintenance form or treat a site-wide campaign center as completing this requirement.
- `esc` escapes HTML characters, `api` handles the token and errors in one place, and `errBox` shows errors. New content that comes from data/copy should use these actual entry points and consider DOM injection risk.
- `services/web-ui/src/main/resources/static/styles.css` defines the existing `.card`, `.grid`, `.btn`, `.hint`, `.alert` and other styles. Reuse the actual layout/responsive conventions; do not bring in another UI framework without reason.
- `services/web-ui/src/main/resources/static/index.html` loads the existing `styles.css` and `app.js`.

## Boundary of the real card API

`services/card-service/src/main/java/com/carddemo/card/interfaces/rest/CardController.java` exposes `GET /api/v1/cards/{cardNumber}`. The response is defined in `interfaces/rest/dto/CardResponse.java`: `cardNumber`, `accountId`, `customerId`, `embossedName`, `expiryDate`, `activeStatus`, `version`.

The current response has no platinum tier or benefit eligibility field. `activeStatus` only represents the card status and cannot be used to decide platinum. The design must state the eligibility source: a new explicit contract, reuse of another verified source, or a clearly labeled input fixture used only in isolated verification. Do not treat a verification fixture as an existing service on the production page.

## Paths not changed in this round

The campaign/reward APIs of `services/marketing-service` and the transaction and posting logic of `services/transaction-service` belong to the existing execution chain. The enrollment and the default dates/rates of the campaign form in `pageOffers` in `app.js` are not a policy basis for this requirement. Viewing the benefit description alone must not call enrollment, reward evaluation, transaction write or posting APIs.

Code and reports must cite the actual commit/code version. This document only locates source code; there is no PR, commit, PRD or test result for this requirement.
