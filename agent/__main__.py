"""Run the agent: uv run -m agent [claim id ...]"""

import sys

from agent.main import main

main(sys.argv[1:])
