/*
 * @adonisjs/lucid
 *
 * (c) Harminder Virk <virk@adonisjs.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { QueryClientContract, OneOrMany } from '@ioc:Adonis/Lucid/Database'
import { LucidModel, LucidRow, BelongsToClientContract } from '@ioc:Adonis/Lucid/Orm'

import { BelongsTo } from './index'
import { managedTransaction } from '../../../utils'
import { BelongsToQueryBuilder } from './QueryBuilder'
import { BelongsToSubQueryBuilder } from './SubQueryBuilder'

/**
 * Query client for executing queries in scope to the belongsTo relationship.
 */
export class BelongsToQueryClient implements BelongsToClientContract<BelongsTo, LucidModel> {
  constructor(
    public relation: BelongsTo,
    private parent: LucidRow,
    private client: QueryClientContract
  ) {}

  /**
   * Generate a query builder instance
   */
  public static query(client: QueryClientContract, relation: BelongsTo, rows: OneOrMany<LucidRow>) {
    const query = new BelongsToQueryBuilder(client.knexQuery(), client, rows, relation)

    typeof relation.onQueryHook === 'function' && relation.onQueryHook(query)
    return query
  }

  /**
   * Generate a eager query
   */
  public static eagerQuery(
    client: QueryClientContract,
    relation: BelongsTo,
    rows: OneOrMany<LucidRow>
  ) {
    const query = new BelongsToQueryBuilder(client.knexQuery(), client, rows, relation)

    query.isRelatedPreloadQuery = true
    typeof relation.onQueryHook === 'function' && relation.onQueryHook(query)
    return query
  }

  /**
   * Returns an instance of the subquery
   */
  public static subQuery(client: QueryClientContract, relation: BelongsTo) {
    const query = new BelongsToSubQueryBuilder(client.knexQuery(), client, relation)

    typeof relation.onQueryHook === 'function' && relation.onQueryHook(query)
    return query
  }

  /**
   * Returns instance of query builder
   */
  public query(): any {
    return BelongsToQueryClient.query(this.client, this.relation, this.parent)
  }

  /**
   * Associate the related model with the parent model
   */
  public async associate(related: LucidRow) {
    await managedTransaction(this.parent.$trx || this.client, async (trx) => {
      related.$trx = trx
      await related.save()

      this.relation.hydrateForPersistence(this.parent, related)
      this.parent.$trx = trx
      await this.parent.save()
    })
  }

  /**
   * Drop association
   */
  public async dissociate() {
    this.parent[this.relation.foreignKey] = null
    await this.parent.save()
  }
}
