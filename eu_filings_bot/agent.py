from __future__ import annotations

import asyncio
import os
from pathlib import Path

from google.adk.agents.llm_agent import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools.mcp_tool.mcp_toolset import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
from mcp import StdioServerParameters

# --- Azure OpenAI (LiteLLM) ---
llm = LiteLlm(
    model="gpt-4.1",  # Force le transport OpenAI pour le proxy LiteLLM
    api_base="http://173.208.208.93:3014/",
    api_key="sk-3996237592156101257",
    parallel_tool_calls=True,
    stream=True  # Re-activé pour une meilleure expérience dans l'interface Web
)

# --- MCP Toolset (Local Stdio) ---
# Chemin absolu vers l'index.js du serveur MCP
mcp_server_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src", "index.js"))

eu_filings_tools = McpToolset(
    connection_params=StdioConnectionParams(
        server_params=StdioServerParameters(
            command="node",
            args=[mcp_server_path],
            env=os.environ.copy(),
        ),
        timeout=60.0  # Augmenté à 60s pour les extractions XBRL lourdes
    )
)



# --- Tool Wrapper to prevent ContextWindowExceedError ---
# On intercepte les sorties des outils pour les tronquer si elles dépassent 1 Mo
# Cela évite de faire planter le LLM sans toucher au code du serveur MCP.
from google.adk.tools.base_tool import BaseTool
from google.adk.tools.base_toolset import BaseToolset

class SafeMcpToolset(BaseToolset):
    def __init__(self, original_toolset):
        super().__init__()
        self.original_toolset = original_toolset
    
    async def get_tools(self, readonly_context=None):
        original_tools = await self.original_toolset.get_tools(readonly_context)
        return [self._wrap_tool(t) for t in original_tools]
    
    def _wrap_tool(self, tool):
        original_run = tool._run_async_impl
        
        async def safe_run(*args, **kwargs):
            result = await original_run(*args, **kwargs)
            # Limite à ~100k caractères (pour permettre plusieurs appels d'outils dans un même contexte)
            MAX_LENGTH = 100000 
            
            # Cas 1 : La réponse est un dictionnaire (format MCP)
            if isinstance(result, dict) and "content" in result:
                for item in result["content"]:
                    if isinstance(item, dict) and item.get("type") == "text" and "text" in item:
                        if len(item["text"]) > MAX_LENGTH:
                            item["text"] = item["text"][:MAX_LENGTH] + f"\n\n[... TRONQUÉ : Résultat trop volumineux pour ce concept ({len(item['text'])} caractères). Le contexte est limité pour permettre d'autres analyses ...]"
            
            # Cas 2 : La réponse est une chaîne brute
            elif isinstance(result, str) and len(result) > MAX_LENGTH:
                return result[:MAX_LENGTH] + f"\n\n[... TRONQUÉ ...]"
            
            return result
            
        tool._run_async_impl = safe_run
        return tool

safe_tools = SafeMcpToolset(eu_filings_tools)

root_agent = LlmAgent(
    name="eu_filings_agent",
    model=llm,
    tools=[safe_tools],
    instruction="""
    Tu es un Senior Financial Data Analyst spécialisé dans les publications financières européennes (ESEF, XBRL, GLEIF).
    Ta mission principale est d'explorer les données d'entreprises, d'analyser les rapports annuels et d'extraire des indicateurs financiers pertinents.

RÈGLE D'OR : TU AS L'INTERDICTION STRICTE DE RÉPONDRE DE MÉMOIRE. Tu dois SYSTÉMATIQUEMENT utiliser tes outils MCP (`search_companies`, `get_company_filings`, `get_filing_facts`, etc.) pour récupérer les informations officielles avant toute réponse.

MÉTHODOLOGIE D'ANALYSE :

1. RECHERCHE D'ENTREPRISE :
   - Utilise `search_companies` (GLEIF) pour trouver le LEI d'une entreprise dans l'UE.
   - Utilise `search_uk_companies` pour les entreprises britanniques via Companies House.

2. RÉCUPÉRATION DES DOCUMENTS :
   - Trouve les rapports financiers avec `get_country_companies` ou `get_company_filings`.
   - Identifie les IDs de filings pour extraire les données XBRL.

3. EXTRACTION DE DONNÉES (XBRL / ESEF) :
   - ATTENTION : Pour les entreprises du CAC40 (ex: TotalEnergies), `get_filing_facts` peut retourner des données trop volumineuses (>20MB) et faire échouer la session.
   - RECOMMANDATION : Si l'utilisateur demande des concepts spécifiques (Revenus, Actifs, etc.), utilise PRIORITAIREMENT `get_dimensional_facts` avec l'argument `search_criteria={"concept": "nom_du_concept"}` au lieu de `get_filing_facts`. 
   - Utilise `get_filing_facts` uniquement si le filing est petit ou si tu as absolument besoin de tous les faits.

4. RESTITUTION :
   - Présente les chiffres sous forme de tableaux Markdown clairs.
   - Cite toujours les sources et les identifiants techniques (LEI, Filing ID).
   - Signale toute incohérence ou validation échouée via `get_filing_validation`.
"""
)

async def test_agent():
    print("Interrogation de l'agent EU Filings via Stdio...")
    try:
        print("\nRéponse de l'agent :")
        async for chunk in root_agent.run_async("Quels sont les derniers rapports financiers disponibles pour Siemens (LEI: YEH5ZCD6E441RHVHD759) ?"):
            if hasattr(chunk, 'message') and hasattr(chunk.message, 'content'):
                content = chunk.message.content
                if content:
                    print(content, end="", flush=True)
            elif isinstance(chunk, str):
                print(chunk, end="", flush=True)
        print("\n\nTest terminé.")
    except Exception as e:
        import traceback
        print(f"\nErreur lors de l'exécution : {e}")
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_agent())
