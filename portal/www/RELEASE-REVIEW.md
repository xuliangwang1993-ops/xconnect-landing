# v1 website review — not a production approval

This branch contains the live homepage snapshot, v9/v10 (Refuel + balance), and six real pages: `/privacy`, `/terms`, `/source`, `/pricing`, `/redeem`, `/download`.

## Confirmed from code / decisions

- Card top-ups: A$5 / 10 / 20 / 50 / 100; custom A$5–A$1000; default no discount.
- Revival cards: 0 / 0 / 1 / 1 / 3 respectively.
- PayPal, Apple sign-in for the app and WeatherKit are outside v1.
- Each release publishes its Corresponding Source as a versioned ZIP plus commit + SHA-256; the development repository need not be public.
- The download page does not pretend native packages exist. Web remains a release candidate until browser verification passes.

## Martin must review before production

- Contact email and support path (not invented by the implementation).
- Conversation/audio/log retention periods; data-hosting regions and provider list.
- Refund policy, balance expiry, minimum age, governing law, liability and GST wording.
- Exact public source ZIP URL and its successful public download.
- Real final download links, versions, checksums and TestFlight/Play records.

## Preview checks

```sh
python3 tools/check-release-pages.py
python3 -m http.server 8765 --directory portal/www
# open http://localhost:8765/privacy/ and the other five directories
```

`feat/legal-pages` supplied the bilingual page structure and legal draft. The release branch updates only facts already decided or evidenced. **It is not a lawyer-reviewed policy, and unresolved facts stay marked.** Deploy to a Pages preview first. Production deployment is Martin's explicit action.
