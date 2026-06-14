# VibeBridge HTML conventions

VibeBridge publishes and maintains a site you build elsewhere. Annotate your HTML so the owner
can edit it later. Annotation is optional. Unannotated HTML still goes live, but annotated HTML
is editable and re-uploads stay stable.

## Editable text: set semantic keys (the golden path)

Add a `data-cms-key` with your own semantic dotted key to every meaningful text element:

```html
<h1 data-cms-key="hero.headline">Welcome</h1>
<p  data-cms-key="hero.subline">We open at 8am.</p>
```

Why this matters: if you do not set keys, the converter auto-assigns index-based keys like
`auto.home.h1_3`. Those work, but they are tied to document position. A later re-upload that
reorders or inserts elements can shift them, so a preserved edit can land on the wrong element.
Your own semantic keys are stable forever. A re-upload re-attaches every edit perfectly no
matter how the layout changed. Treat semantic keys as the default, not the exception. The
`validate_html` check warns when a page is all auto keys.

## Sections: group slots for the editor

Group slots in the editor sidebar with `data-cms-section`:

```html
<section data-cms-section="hero"> ... </section>
```

This is purely organizational. It gives the owner a tidy, named group of slots to edit.

## Images and buttons

```html
<img data-cms-key="hero.image" data-cms-type="image" src="hero.jpg">
<a   data-cms-button="hero.cta" href="/contact">Book now</a>
```

An image needs both `data-cms-key` and `data-cms-type="image"` to become an editable image
slot. Without `data-cms-type="image"` the slot is treated as editable text (the raw src string),
not as an image picker, so always include both attributes together.

A `data-cms-button` on an `<a>` creates an editable slot for the link's URL. The button's label
is its visible text. To make that text independently editable too, add a `data-cms-key` on the
link (or on an inner element), for example `<a data-cms-button="hero.cta" data-cms-key="hero.cta_label" href="/contact">Book now</a>`.

## Forms and lead capture

Native `<form>` elements are auto-detected, and their submissions become leads.

- A simple form is imported into the Form Editor.
- A JS-driven multi-step form whose id is referenced in a `<script>` is not imported into the
  editor, but its submit is still wired for lead capture, as long as its `action` is empty,
  relative, or same-page, for example `action="?form=contact"`.
- Do not point the form `action` at an external URL, another origin, or a `mailto:` unless you
  mean to bypass VibeBridge. Those forms are left alone and the lead will NOT reach the
  VibeBridge inbox.

Never ship a form whose `action` points off-site if you want the leads. An external action
loses every submission.

### Forms rendered at runtime by JS

Detection reads the HTML you upload. A `<form>` your JavaScript builds after load is not in
that HTML, so it cannot be detected or wired, and its leads would be lost. VibeBridge does not
execute your JS. Two ways to fix it, pick one:

Easiest, mark the form. Add one attribute to the form element:

```html
<form data-vbb-form="contact"> ... </form>
```

Every published site loads the VibeBridge lead-capture runtime. It finds marked forms in the
live DOM, even ones rendered at runtime, captures submissions to the owner's inbox, and the
form appears in the portal automatically. Give each form a unique short slug. On externally
hosted sites, also add the loader once:

```html
<script src="https://app.vibebridge.ai/vbb-forms.js" data-vbb-site="<siteSlug>" defer></script>
```

Or declare it via the API, when you want fields editable up front:

1. `form_create` with `{ site, slug, label }` returns a `submitEndpoint`.
2. `form_update` with `{ site, formSlug, fields }` lets the owner edit fields.
3. POST your form to that `submitEndpoint` as FormData or JSON from client code.

Tip: prefer shipping built, pre-rendered HTML with a static `<form>` when you can. Then plain
detection handles it and you need neither of the above.

## Relative images must be shipped

If your HTML references images by relative path, the files are not on the deployed site and the
images vanish. This applies to `<img src="portrait.jpg">` and to CSS like
`url('hero.png')`. Do one of the following:

- Pass the files alongside the HTML on upload. The CLI collects local images automatically. Via
  the API, pass them in the `page_upload` `assets` array as
  `[{ "path": "portrait.jpg", "contentBase64": "<base64>" }]`. They are uploaded and every
  relative reference is rewritten to the public URL.
- Or inline small images as `data:` URIs in the HTML.
- Or use absolute `https://` URLs.

## Bilingual and inline-formatted text

Inline `<em>`, `<strong>`, `<a>`, and `<br>` inside a text element are preserved in the HTML.
The owner edits them in a rich-text editor in the sidebar, not as separate plain-text slots, and
the markup is kept and sanitized on save. Bilingual `<span lang="de">...</span><span lang="en">...</span>`
pairs are automatically split so each language becomes its own editable text slot.

You do not need to split languages yourself. That said, giving each language its own element with
its own semantic `data-cms-key` still gives the cleanest per-language editing and is fine to do.

## Verify before you ship

Run `validate_html` (or `npx vibebridge check`) on your HTML. It reports the editable
slots, which forms capture leads, and any real problem, such as a form that would lose leads.
Fix the issues, then upload. Never ship a form flagged as not capturing leads.
