# Today's weather on the home screen

Both hosts' home screens open on the day where the owner is: the day's range,
what to wear, and — when rain is likely — an umbrella and the hours it is for.

```
TODAY IN MANHATTAN
Bring a light jacket
59–70°
Bring an umbrella
Rain likely 2–5 PM
```

## Where the owner is

The device asks its own location (`navigator.geolocation`; the extension holds
the `geolocation` permission because a side panel cannot raise a prompt) and
rounds it to two decimals, about a kilometre, before it leaves the device. If
the browser cannot or will not say — a refused permission, a Mac without
Location Services for Chrome, a prompt left unanswered for thirty seconds — the
Worker goes by Cloudflare's reading of the connection instead, which is right
on a home or office network and can be a city away on a phone's. The place is
always named in the heading, so a wrong one is visible.

## Once a day

The advice is worked out on the first look of the day and kept in the device's
encrypted store (`weather-day`), keyed by the local date. Every later look that
day reads it back: no location, no request, and advice that does not change as
the day goes on. A failed attempt keeps nothing, so the next look tries again.
Disconnecting a device clears the copy with the other private offline data.

## The rule

`chrome-sidebar/src/weather-data.js` owns it, and its tests read it hour by hour.

- **Which hours.** 7 AM to 10 PM, from the hour the day is worked out — a first
  look at 3 PM dresses for the afternoon and evening.
- **What to wear** is set by the coldest *feels-like* temperature in those
  hours (wind and humidity included), about five degrees warmer than a general
  chart because the owner runs a little cold: below 50° a heavy jacket, below
  62° a light jacket, below 70° a sweater and no jacket, and otherwise neither.
- **The range** is the calendar day's low and high. Where the coldest feel is
  at least three degrees under the low, it is added (`feels like 45°`) so the
  advice does not look out of step with the numbers.
- **Rain** is likely in an hour whose chance is 50% or more. Those hours are
  given as spans (`2–5 PM`, `8–10 AM and 4–6 PM`, or `all day`); a single dry
  hour between two wet ones does not split them, and past two spans the whole
  stretch is given. Snow is said as snow, under the jacket, with no umbrella.

## Where it comes from

`GET /v1/weather[?lat=&lon=]` in `tools-api/src/weather.js`. It stores nothing.
Open-Meteo answers the forecast (Fahrenheit, the place's own time zone) and
OpenStreetMap's Nominatim names the place, both free and keyless; the Worker
identifies itself to both. A place that cannot be named is left off — or
Cloudflare's city stands in, when the connection is within 30 km of the
device — and only a missing forecast is a failure. A failure shows no weather
and says nothing, like the rest of the home screen.
