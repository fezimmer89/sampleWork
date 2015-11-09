'use strict';

var dateCalc          = require('../../../shared/dateCalculator');
var sqlRepository     = require('../../services/sqlRepository');
var camelConverter    = require('../../utils/camelCaseConverter');
var moment            = require('moment');
var _                 = require('lodash');
var paginationService = require('../../services/paginationService');
var constants         = require('../../../shared/constants');
var mongoose          = require('mongoose-q')(require('mongoose'), {spread: true});
var HierarchyNode     = mongoose.model('HierarchyNode');
var Q                 = require('q');
var hierarchyManager  = require('../../services/hierarchyManager');


var multiGroupBy = function(seq, keys) {
	if (!keys.length)
		return seq;
	var first = keys[0];
	var rest = keys.slice(1);
	return _.mapValues(_.groupBy(seq, first), function(value) {
		return multiGroupBy(value, rest);
	});
};

_.mixin({
	'multiGroupBy': multiGroupBy
});

function groupData(data, groupBy) {
	return _.multiGroupBy(data, groupBy || ['hierarchyNodeName', 'productName', 'salesTypeName']);
}


function Sale(req) {

	function aggregate(accumulator, currentVals, aggregateCombination) {

		if(aggregateCombination){		
			accumulator.units           += currentVals.units;
			accumulator.percentage      += currentVals.percentage;
			accumulator.totalAdjPercent += currentVals.totalAdjPercent;
			accumulator.totalVariance   += currentVals.totalVariance;

			accumulator.percentCount    += currentVals.percentCount;
			accumulator.adjPercentCount += currentVals.adjPercentCount;
			accumulator.varianceCount   += currentVals.varianceCount;
		}else{
			accumulator.units           += currentVals.units;
			accumulator.percentage      += currentVals.percentageOfIdealDrop;
			accumulator.totalAdjPercent += currentVals.adjIdealDrop;
			accumulator.totalVariance   += currentVals.variance;


			if(currentVals.percentageOfIdealDrop)
				accumulator.percentCount++;

			if(currentVals.adjIdealDrop)
				accumulator.adjPercentCount++;

			if(currentVals.variance)
				accumulator.varianceCount++;
		}

		return accumulator;
	}

	function average(accumulator) {
		accumulator.percentageOfIdealDrop = accumulator.percentCount > 0 ? 
												accumulator.percentage / accumulator.percentCount : 0;
		accumulator.adjIdealDrop = accumulator.adjPercentCount > 0 ? 
										accumulator.totalAdjPercent / accumulator.adjPercentCount : 0;
		accumulator.variance = accumulator.varianceCount > 0 ? 
											accumulator.totalVariance / accumulator.varianceCount : 0;

		return accumulator;
	}

	function defaultAccumulator() {
		return {
			units           : 0,
			percentage      : 0,
			totalAdjPercent : 0,
			totalVariance   : 0,
			percentCount    : 0,
			adjPercentCount : 0,
			varianceCount   : 0
		};
	}

	function aggregteSales(sales){

		//Grand Total Aggregates
		var data = _.reduce(sales, function(results, products, hierarchyNodeName) {

			//Hierarchy Aggregates
			var dcTotals = _.reduce(products, function(results, salesTypes, product) {

				//Product Aggregates
				var productTotals = _.reduce(salesTypes, function(results, sales, salesType) {

					//Sale Type Aggregates
					var salesTypeTotals = _.reduce(sales, function(result, sale) {
							return aggregate(result, sale);
						}, defaultAccumulator());
						
					results.salesTypes[salesType] = { aggregates: average(salesTypeTotals) };
					results.aggregates = aggregate(results.aggregates, salesTypeTotals, true);

					return results;

				}, {
					aggregates    : defaultAccumulator(),
					salesTypes : {}
				});

				productTotals.aggregates = average(productTotals.aggregates);

				results.products[product] = productTotals;
				results.aggregates = aggregate(results.aggregates, productTotals.aggregates, true);
				return results;

			}, {
				aggregates : defaultAccumulator(),
				products   : {}
			});

			dcTotals.aggregates = average(dcTotals.aggregates);

			results.hierarchyNodes[hierarchyNodeName] = dcTotals;
			results.aggregates = aggregate(results.aggregates, dcTotals.aggregates, true);
			return results;

		}, {
			aggregates      : defaultAccumulator(),
			hierarchyNodes : {}
		});

		data.aggregates = average(data.aggregates);

		return data;
	}

	function reduceNodeData(mappedData) {
		var result = _.reduce(mappedData, function(result, current) {
			if(current.aggregates)
				result = aggregate(result, current.aggregates, true);

			return result;
		}, defaultAccumulator());

		return average(result);
	}

	function reduceTreeStructureRecursive(node, fullTree) {
		var decendantLeafNodes = hierarchyManager.getDescendantLeafs(fullTree, node);

		if(_.all(decendantLeafNodes, function(leaf) { return leaf.noSalesFlag; }))
			return null;


		var result = {
				nodes: {},
				aggregates: reduceNodeData(decendantLeafNodes)
			};
		
		if(node.children){
			_.forEach(node.children, function(childNode){
				if(!childNode.isLeaf) {
					var childAggregate = reduceTreeStructureRecursive(childNode, fullTree);
					if(childAggregate) {
						result.nodes[childNode.id] = childAggregate;
						result.nodes[childNode.id].aggregates.hierarchyNodeName = childNode.name;
					}
				}
				else{
					if(childNode.aggregates && !childNode.noSalesFlag)
						result.nodes[childNode.id]= {aggregates : childNode.aggregates};
				}
			});
		}

		return result;
	}

	function querySales(){

		return sqlRepository.getSalesList(req.params.subscriberId,
			req.query.productIds,
			req.query.hierarchyNodes,
			moment(req.query.startDate, "YYYY-MM-DD"),
			moment(req.query.endDate, "YYYY-MM-DD"))
			.then(function(sales) {

				if(req.query.sortProp){
					sales = paginationService
									.sort(sales, req.query.sortProp, req.query.sortDir);
				}

				if(req.query.hierarchyNode && req.query.product && req.query.salesType){ // filter for detail view only
					sales = _.filter(sales, function(sale){
						return (sale.hierarchyNodeName == req.query.hierarchyNodeName && 
									sale.productName == req.query.product && 
									sale.saleTypeName == req.query.saleType);
					});
				}

				return sales;
			});
	}

	this.getSales = function() {
		return querySales()
			.then(function(sales) {
				return {
					data: sales
				};
			});
	};

	this.getAggregatedSales = function(){
		return querySales()
			.then(function(sales) {
				sales = groupData(sales);
				return aggregteSales(sales);
			});
	};

	this.getNodeAggregatedSales = function(){
		return Q.all([querySales(),
						HierarchyNode.getHierarchyNodesQ(req.params.subscriberId, constants.hierarchyType.hierarchyNode)])
			.spread(function(sales, nodes) {
				var selectedNode = hierarchyManager.getNodeById(nodes, req.query.hierarchyNodeId);

				var treeStructure = hierarchyManager.getDescendants(hierarchyManager.convertArrayToTree(nodes), selectedNode, true);

				// set the aggregate object for each leaf node
				_.forEach(treeStructure, function(node) {
					if (node.isLeaf) {

						var matchingSales = _.remove(sales, function(div) {
							return div.hierarchyNodeName == node.name;
						});

						var aggregates = _.reduce(matchingSales, function(result, sale) {
								return aggregate(result, sale);
							}, defaultAccumulator());

						if(matchingSales.length === 0)
							node.noSalesFlag = true;

						node.aggregates = average(aggregates);
						node.aggregates.hierarchyNodeName = node.name;
					}
				});

				return reduceTreeStructureRecursive(selectedNode, treeStructure);
			});
	};
}


module.exports = {

	list: function(req, res) {
		var sale = new Sale(req);

		sale
			.getSales()
			.then(function(sales) {
				return res.send(paginationService
									.getPage(sales.data, req.query.pageSize, req.query.pageNumber));				
			})
			.done();
	},

	aggregates: function(req, res) {
		var sale = new Sale(req);

		sale
			.getAggregatedSales()
			.then(function(sales) {
				return res.send(sales);
			})
			.done();
	},

	nodeSummary: function(req, res) {
		var sale = new Sale(req);

		sale
			.getNodeAggregatedSales()
			.then(function(sales) {				
				return res.send(sales);
			})
			.done();
	},

	getSaleInfo: function(req, res) {
		sqlRepository.getSaleInfo(req.params.subscriberId, req.params.saleId)
			.then(function(sale) {
				return res.send(camelConverter.convertKeysToCamelCase(sale));
			})
			.done();
	},

	getHistory: function(req, res) {
		req.query.endDate = moment(req.query.lastSaleDate, "YYYY-MM-DD");
		req.query.startDate = moment(req.query.lastSaleDate).subtract(1, 'years');
		if (req.query.byWeek) {
			sqlRepository.getSalesWeeklyHistory(req.params.subscriberId,
				req.query.productIds,
				req.query.hierarchyNodes,
				req.query.startDate,
				req.query.endDate)
				.then(function(historicalSales) {
					return res.send(camelConverter.convertKeysToCamelCase(historicalSales));
				})
				.done();
		} else {
			sqlRepository.getSalesMonthlyHistory(req.params.subscriberId,
				req.query.productIds,
				req.query.hierarchyNodes,
				req.query.startDate,
				req.query.endDate)
				.then(function(historicalSales) {
					return res.send(camelConverter.convertKeysToCamelCase(historicalSales));
				})
				.done();
		}
	},

	getSaleDate: function(req, res) {
		
		sqlRepository.getSaleDate(req.params.subscriberId,
			req.query.hierarchyNodes,
			moment(req.query.comparisonDate))
			.then(function(lastSaleDate) {
				return res.send({
					date: lastSaleDate
				});
			})
			.done();
	}
};





