import unittest

from flowsight.api.human_mobility_utils import _record_filter_clauses


class TopicFilterGroupTests(unittest.TestCase):
    def compile_topic_clause(self, conditions):
        return _record_filter_clauses(
            conditions,
            "flowsight.tg_topic_id_positive",
            "message_unique_id",
        )[0]

    def test_legacy_topics_keep_or_semantics(self):
        clause = self.compile_topic_clause([
            {"field": "Topic", "operator": "IS", "value": 2},
            {"field": "Topic", "operator": "IS", "value": 1},
        ])

        self.assertEqual(clause, " AND ttip.topic_unique_id IN (1, 2)")

    def test_and_joins_groups_but_not_topics_inside_a_group(self):
        clause = self.compile_topic_clause([
            {
                "field": "Topic",
                "operator": "IS",
                "value": 1,
                "topic_group": "climate",
                "topic_group_join": "AND",
            },
            {
                "field": "Topic",
                "operator": "IS",
                "value": 2,
                "topic_group": "climate",
                "topic_group_join": "AND",
            },
            {
                "field": "Topic",
                "operator": "IS",
                "value": 20,
                "topic_group": "diseases",
                "topic_group_join": "AND",
            },
        ])

        self.assertIn("ttip.topic_unique_id IN (1, 2, 20)", clause)
        self.assertEqual(clause.count("EXISTS ("), 2)
        self.assertIn("topic_group_0.topic_unique_id IN (1, 2)", clause)
        self.assertIn("topic_group_1.topic_unique_id IN (20)", clause)
        self.assertIn(") AND EXISTS (", " ".join(clause.split()))

    def test_malformed_topic_id_fails_closed(self):
        clause = self.compile_topic_clause([
            {"field": "Topic", "operator": "IS", "value": "not-an-id"},
        ])

        self.assertEqual(clause, " AND FALSE")

    def test_or_can_join_groups_that_require_all_topics(self):
        clause = self.compile_topic_clause([
            {
                "field": "Topic",
                "operator": "IS",
                "value": topic_id,
                "topic_group": group_id,
                "topic_join": "AND",
                "topic_group_join": "OR",
            }
            for group_id, topic_ids in (("first", (1, 2)), ("second", (20, 21)))
            for topic_id in topic_ids
        ])
        normalized_clause = " ".join(clause.split())

        self.assertEqual(clause.count("EXISTS ("), 2)
        self.assertEqual(clause.count("HAVING count(DISTINCT"), 2)
        self.assertIn("= 2", clause)
        self.assertIn(") OR EXISTS (", normalized_clause)


if __name__ == "__main__":
    unittest.main()
