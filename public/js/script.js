$('.alert-success').hide();
$('.alert-danger').hide();

$('#form').on('submit', function(event) {
  event.preventDefault();

  $('.alert-success').hide();
  $('.alert-danger').hide();

  var form = $(this).serialize();

  var jqxhr = $.post('/admin', form, function(data) {
    if (data.status === 1) {
      $('.alert-success').show();
    } else {
      $('.alert-danger').text(data.message).show();
    }
  })
    .fail(function() {
      $('.alert-danger').text('Something went badly wrong while saving the new configuration.').show();
    })
    .always(function() {
      window.scrollTo(0, 0);
    });
});