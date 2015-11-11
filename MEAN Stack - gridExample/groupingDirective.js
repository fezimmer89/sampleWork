angular.module('example.directives').directive('groupingDirective', [
	'$parse', '$compile', '$templateCache', '_',
	function($parse, $compile, $templateCache, _) {
		
		'use strict';

		return {
			link: function(scope, element, attr) {

				scope.data  = $parse(attr.groupingDirective)(scope);
				var level   = $parse(attr.level)(scope) || 0;
				scope.level = [];

				for (var i = 0; i < level; i++)
					scope.level.push({});

				if (scope.data.nodes && (scope.distanceFromLeaf - scope.level.length) > 1){
					_.forEach(Object.keys(scope.data.nodes), function(nodeKey){
						scope.parentKeys[scope.data.nodes[nodeKey].aggregates.hierarchyNodeName] = $parse(attr.parentKey)(scope);
					});	
					element.after($compile($templateCache.get('rowTemplate.html'))(scope));
				}
			}
		};
	}
]);