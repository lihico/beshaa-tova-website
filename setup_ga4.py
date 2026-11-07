#!/usr/bin/env python3
"""
Configure Google Analytics 4 property for beshaa-tova.co.il.

Reads service account credentials from website/.env.local and uses
the GA4 Admin API to:
  1. Find the GA4 property by measurement ID
  2. Mark custom events as key events (conversions)
  3. Create retargeting audiences
  4. Verify enhanced measurement is enabled

Prerequisites:
  pip install google-analytics-admin python-dotenv

Usage:
  python3 website/setup_ga4.py
"""

from pathlib import Path
from dotenv import dotenv_values

from google.analytics.admin_v1alpha import (
    AnalyticsAdminServiceClient,
    ListAccountsRequest,
    ListPropertiesRequest,
    ListDataStreamsRequest,
    CreateKeyEventRequest,
    KeyEvent,
    CreateAudienceRequest,
    Audience,
    AudienceFilterClause,
    AudienceFilterExpression,
    AudienceFilterExpressionList,
    AudienceFilterScope,
    AudienceEventFilter,
    AudienceDimensionOrMetricFilter,
    AudienceSimpleFilter,
)
from google.oauth2.service_account import Credentials

MEASUREMENT_ID = "G-W3Z965PSD0"
SCOPES = ["https://www.googleapis.com/auth/analytics.edit"]

ENV_PATH = Path(__file__).parent / ".env.local"

KEY_EVENTS_TO_CREATE = [
    ("purchase", KeyEvent.CountingMethod.ONCE_PER_EVENT),
    ("gift_purchase", KeyEvent.CountingMethod.ONCE_PER_EVENT),
    ("voucher_redeem", KeyEvent.CountingMethod.ONCE_PER_EVENT),
    ("begin_order", KeyEvent.CountingMethod.ONCE_PER_SESSION),
    ("select_flow", KeyEvent.CountingMethod.ONCE_PER_SESSION),
]


def get_credentials():
    env = dotenv_values(ENV_PATH)
    email = env["GOOGLE_SERVICE_ACCOUNT_EMAIL"]
    key = env["GOOGLE_PRIVATE_KEY"].replace("\\n", "\n")

    sa_info = {
        "type": "service_account",
        "project_id": "beshaa-tova",
        "private_key": key,
        "client_email": email,
        "token_uri": "https://oauth2.googleapis.com/token",
    }

    return Credentials.from_service_account_info(sa_info, scopes=SCOPES)


def find_property(client: AnalyticsAdminServiceClient):
    """Find GA4 property by iterating accounts and matching measurement ID."""
    accounts = list(client.list_accounts(ListAccountsRequest()))
    print(f"Found {len(accounts)} account(s)")

    for account in accounts:
        print(f"  Account: {account.display_name} ({account.name})")
        properties = list(
            client.list_properties(
                ListPropertiesRequest(filter=f'parent:{account.name}')
            )
        )
        for prop in properties:
            print(f"    Property: {prop.display_name} ({prop.name})")
            streams = list(
                client.list_data_streams(
                    ListDataStreamsRequest(parent=prop.name)
                )
            )
            for stream in streams:
                if stream.web_stream_data and stream.web_stream_data.measurement_id == MEASUREMENT_ID:
                    print(f"    -> Found matching stream: {stream.web_stream_data.measurement_id}")
                    return prop.name, stream.name
    return None, None


def create_key_events(client, property_name):
    """Mark custom events as key events (conversions)."""
    print("\n--- Creating Key Events (Conversions) ---")

    existing = list(client.list_key_events(parent=property_name))
    existing_names = {ke.event_name for ke in existing}
    print(f"Existing key events: {existing_names}")

    for event_name, counting in KEY_EVENTS_TO_CREATE:
        if event_name in existing_names:
            print(f"  [skip] {event_name} already exists")
            continue
        try:
            ke = client.create_key_event(
                CreateKeyEventRequest(
                    key_event=KeyEvent(
                        event_name=event_name,
                        counting_method=counting,
                    ),
                    parent=property_name,
                )
            )
            print(f"  [created] {event_name} -> {ke.name}")
        except Exception as e:
            print(f"  [error] {event_name}: {e}")


def create_audiences(client, property_name):
    """Create retargeting audiences."""
    print("\n--- Creating Audiences ---")

    existing = list(client.list_audiences(parent=property_name))
    existing_names = {a.display_name for a in existing}
    print(f"Existing audiences: {existing_names}")

    audiences_to_create = [
        {
            "display_name": "Started Order (No Purchase)",
            "description": "Visited order page but did not complete purchase",
            "membership_duration_days": 30,
            "filter_clauses": [
                AudienceFilterClause(
                    clause_type=AudienceFilterClause.AudienceClauseType.INCLUDE,
                    simple_filter=AudienceSimpleFilter(
                        scope=AudienceFilterScope.AUDIENCE_FILTER_SCOPE_ACROSS_ALL_SESSIONS,
                        filter_expression=AudienceFilterExpression(
                            and_group=AudienceFilterExpressionList(
                                filter_expressions=[
                                    AudienceFilterExpression(
                                        or_group=AudienceFilterExpressionList(
                                            filter_expressions=[
                                                AudienceFilterExpression(
                                                    event_filter=AudienceEventFilter(
                                                        event_name="begin_order",
                                                    ),
                                                ),
                                            ],
                                        ),
                                    ),
                                ],
                            ),
                        ),
                    ),
                ),
                AudienceFilterClause(
                    clause_type=AudienceFilterClause.AudienceClauseType.EXCLUDE,
                    simple_filter=AudienceSimpleFilter(
                        scope=AudienceFilterScope.AUDIENCE_FILTER_SCOPE_ACROSS_ALL_SESSIONS,
                        filter_expression=AudienceFilterExpression(
                            and_group=AudienceFilterExpressionList(
                                filter_expressions=[
                                    AudienceFilterExpression(
                                        or_group=AudienceFilterExpressionList(
                                            filter_expressions=[
                                                AudienceFilterExpression(
                                                    event_filter=AudienceEventFilter(
                                                        event_name="purchase",
                                                    ),
                                                ),
                                            ],
                                        ),
                                    ),
                                ],
                            ),
                        ),
                    ),
                ),
            ],
        },
        {
            "display_name": "Gift Page Visitors",
            "description": "Users who selected the gift flow",
            "membership_duration_days": 30,
            "filter_clauses": [
                AudienceFilterClause(
                    clause_type=AudienceFilterClause.AudienceClauseType.INCLUDE,
                    simple_filter=AudienceSimpleFilter(
                        scope=AudienceFilterScope.AUDIENCE_FILTER_SCOPE_ACROSS_ALL_SESSIONS,
                        filter_expression=AudienceFilterExpression(
                            and_group=AudienceFilterExpressionList(
                                filter_expressions=[
                                    AudienceFilterExpression(
                                        or_group=AudienceFilterExpressionList(
                                            filter_expressions=[
                                                AudienceFilterExpression(
                                                    event_filter=AudienceEventFilter(
                                                        event_name="gift_purchase",
                                                    ),
                                                ),
                                            ],
                                        ),
                                    ),
                                ],
                            ),
                        ),
                    ),
                ),
            ],
        },
        {
            "display_name": "Purchasers",
            "description": "Users who completed a self-order or gift purchase",
            "membership_duration_days": 90,
            "filter_clauses": [
                AudienceFilterClause(
                    clause_type=AudienceFilterClause.AudienceClauseType.INCLUDE,
                    simple_filter=AudienceSimpleFilter(
                        scope=AudienceFilterScope.AUDIENCE_FILTER_SCOPE_ACROSS_ALL_SESSIONS,
                        filter_expression=AudienceFilterExpression(
                            or_group=AudienceFilterExpressionList(
                                filter_expressions=[
                                    AudienceFilterExpression(
                                        event_filter=AudienceEventFilter(event_name="purchase"),
                                    ),
                                    AudienceFilterExpression(
                                        event_filter=AudienceEventFilter(event_name="gift_purchase"),
                                    ),
                                ],
                            ),
                        ),
                    ),
                ),
            ],
        },
    ]

    for audience_config in audiences_to_create:
        name = audience_config["display_name"]
        if name in existing_names:
            print(f"  [skip] '{name}' already exists")
            continue
        try:
            audience = client.create_audience(
                CreateAudienceRequest(
                    parent=property_name,
                    audience=Audience(
                        display_name=name,
                        description=audience_config["description"],
                        membership_duration_days=audience_config["membership_duration_days"],
                        filter_clauses=audience_config["filter_clauses"],
                    ),
                )
            )
            print(f"  [created] '{name}' -> {audience.name}")
        except Exception as e:
            print(f"  [error] '{name}': {e}")


def check_enhanced_measurement(client, stream_name):
    """Check enhanced measurement settings on the web data stream."""
    print("\n--- Enhanced Measurement Settings ---")
    try:
        settings = client.get_enhanced_measurement_settings(name=f"{stream_name}/enhancedMeasurementSettings")
        print(f"  Stream events enabled: {settings.stream_enabled}")
        print(f"  Scrolls:              {settings.scrolls_enabled}")
        print(f"  Outbound clicks:      {settings.outbound_clicks_enabled}")
        print(f"  Site search:          {settings.site_search_enabled}")
        print(f"  Page views:           {settings.page_views_enabled}")
        print(f"  Form interactions:    {settings.form_interactions_enabled}")
        print(f"  File downloads:       {settings.file_downloads_enabled}")

        if not settings.stream_enabled:
            print("\n  [!] Enhanced measurement is DISABLED. Enabling now...")
            settings.stream_enabled = True
            client.update_enhanced_measurement_settings(
                enhanced_measurement_settings=settings,
            )
            print("  [done] Enhanced measurement enabled.")
    except Exception as e:
        print(f"  [error] Could not read enhanced measurement: {e}")


def main():
    print("=== GA4 Configuration for beshaa-tova.co.il ===\n")

    creds = get_credentials()
    client = AnalyticsAdminServiceClient(credentials=creds)

    property_name, stream_name = find_property(client)
    if not property_name:
        print("\n[ERROR] Could not find GA4 property with measurement ID", MEASUREMENT_ID)
        print("Make sure the service account has been added to the GA4 property:")
        print("  1. Go to GA4 > Admin > Property access management")
        print(f"  2. Add: beshaa-tova-service@beshaa-tova.iam.gserviceaccount.com")
        print("  3. Give it 'Editor' role")
        print("  4. Re-run this script")
        return

    print(f"\nProperty: {property_name}")
    print(f"Stream:   {stream_name}")

    create_key_events(client, property_name)
    create_audiences(client, property_name)
    check_enhanced_measurement(client, stream_name)

    print("\n=== Done! ===")
    print("Next steps:")
    print("  - Deploy the website: vercel --prod --yes (from repo root)")
    print("  - Visit the site and check GA4 Real-time report")
    print("  - Link Search Console: GA4 > Admin > Product links > Search Console")


if __name__ == "__main__":
    main()
